/**
 * Catalog CSV import / export (REQUIREMENTS §17): templates, dry run with
 * row errors + duplicate detection (nothing written), idempotent commit,
 * idempotent re-import, powertrain / unit / price / verification rules per
 * row, restricted export that round-trips (incl. the formula-injection
 * guard). Fictional test data only.
 */
import { userWithRoles, waitForAudit, type PlatformUser } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

const csv = (lines: string[]) => Buffer.from(`${lines.join('\n')}\n`, 'utf8');

describe('Vehicles CSV import / export (e2e)', () => {
  let t: TestApp;
  let manager: PlatformUser;
  let admin: PlatformUser;
  let writer: PlatformUser; // imports.run + vehicles.write only
  let editor: PlatformUser;
  let normal: PlatformUser;

  const upload = (u: PlatformUser, type: string, body: Buffer, dryRun?: boolean) =>
    t
      .http()
      .post(
        `/api/v1/admin/vehicles/import/${type}${dryRun === undefined ? '' : `?dryRun=${dryRun}`}`,
      )
      .set(u.auth)
      .attach('file', body, `${type}.csv`);

  beforeAll(async () => {
    t = await createTestApp();
    const role = await t.prisma.role.create({
      data: { key: 'e2e_importer', nameEn: 'E2E importer', nameAr: 'مستورد اختبار' },
    });
    for (const key of ['vehicles.read', 'vehicles.write', 'imports.run']) {
      const p = await t.prisma.permission.findUniqueOrThrow({ where: { key } });
      await t.prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
    [manager, admin, writer, editor, normal] = await Promise.all([
      userWithRoles(t, ['vehicle_data_manager', 'user']),
      userWithRoles(t, ['admin', 'user']),
      userWithRoles(t, ['e2e_importer', 'user']),
      userWithRoles(t, ['editor', 'user']),
      userWithRoles(t, ['user']),
    ]);
  });
  afterAll(async () => {
    await t?.close();
  });

  const VARIANTS = [
    'brand_slug,brand_name_en,brand_name_ar,model_slug,model_name_en,model_name_ar,body_type,generation_slug,generation_name_en,generation_name_ar,year,variant_name_en,variant_name_ar,powertrain,drive,seats',
    'csvtest-motors,CSV Test Motors,سي إس في للاختبار,csvtest-motors-nova,Nova,نوفا,suv,gen-1,Gen 1,الجيل 1,2025,Base,الأساسية,BEV,rwd,5',
    'csvtest-motors,CSV Test Motors,سي إس في للاختبار,csvtest-motors-nova,Nova,نوفا,suv,gen-1,Gen 1,الجيل 1,2025,Base,الأساسية,PHEV,fwd,5',
    'csvtest-motors,CSV Test Motors,سي إس في للاختبار,csvtest-motors-nova,Nova,نوفا,suv,gen-1,Gen 1,الجيل 1,2025,Base,الأساسية المكررة,BEV,rwd,5',
    'csvtest-motors,CSV Test Motors,سي إس في للاختبار,csvtest-motors-nova,Nova,نوفا,suv,gen-1,Gen 1,الجيل 1,2025,Broken,معطوبة,DIESEL,rwd,5',
  ];
  let previewId: string;
  let commitId: string;
  const BEV = 'csvtest-motors-nova-2025-base-bev';
  const PHEV = 'csvtest-motors-nova-2025-base-phev';

  it('lists templates and serves an empty CSV template', async () => {
    const list = await t
      .http()
      .get('/api/v1/admin/vehicles/import/templates?lang=en')
      .set(manager.auth)
      .expect(200);
    const specs = list.body.data.find((x: { type: string }) => x.type === 'specs');
    expect(specs.columns.find((c: { name: string }) => c.name === 'value')).toMatchObject({
      required: true,
    });
    expect(list.body.data.find((x: { type: string }) => x.type === 'prices').permissions).toContain(
      'prices.write',
    );
    const file = await t
      .http()
      .get('/api/v1/admin/vehicles/import/templates/specs.csv')
      .set(manager.auth)
      .expect(200);
    expect(file.headers['content-type']).toContain('text/csv');
    expect(file.text.replace('\uFEFF', '').split('\n')[0]).toBe(specs.header);
    await t
      .http()
      .get('/api/v1/admin/vehicles/import/templates/nope')
      .set(manager.auth)
      .expect(404);
  });

  it('needs imports.run + vehicles.write', async () => {
    await upload(normal, 'variants', csv(VARIANTS)).expect(403);
    await upload(editor, 'variants', csv(VARIANTS)).expect(403);
  });

  it('refuses malformed files with CSV_INVALID', async () => {
    const unknown = await upload(manager, 'variants', csv(['brand_slug,surprise', 'x,y'])).expect(
      422,
    );
    expect(unknown.body.error.code).toBe('CSV_INVALID');
    expect(unknown.body.error.details).toMatchObject({ unknownColumns: ['surprise'] });
    expect(unknown.body.error.details.missingColumns).toContain('model_slug');
    const noFile = await t
      .http()
      .post('/api/v1/admin/vehicles/import/variants')
      .set(manager.auth)
      .expect(422);
    expect(noFile.body.error.code).toBe('CSV_INVALID');
    await upload(manager, 'variants', csv([VARIANTS[0]])).expect(422);
  });

  it('dry run: row errors and duplicates, nothing written', async () => {
    const res = await upload(manager, 'variants', csv(VARIANTS)).expect(200);
    const d = res.body.data;
    previewId = d.job.id;
    expect(d.job).toMatchObject({ type: 'vehicles.variants', dryRun: true, status: 'ready' });
    expect(d.summary).toEqual({
      total: 4,
      create: 2,
      update: 0,
      unchanged: 0,
      duplicate: 1,
      invalid: 1,
      failed: 0,
    });
    const dup = d.rows.find((r: { rowNumber: number }) => r.rowNumber === 3);
    expect(dup).toMatchObject({ status: 'duplicate' });
    expect(dup.errors[0].code).toBe('duplicate_in_file');
    const bad = d.rows.find((r: { rowNumber: number }) => r.rowNumber === 4);
    expect(bad).toMatchObject({ status: 'invalid' });
    expect(bad.errors[0]).toMatchObject({ field: 'powertrain', code: 'isIn' });
    expect(await t.prisma.brand.count({ where: { slug: 'csvtest-motors' } })).toBe(0);
    const audit = await waitForAudit(t, 'vehicles.import');
    expect(audit.entityId).toBe(previewId);
  });

  it('commit applies the preview once (idempotent)', async () => {
    const res = await t
      .http()
      .post(`/api/v1/admin/vehicles/import/jobs/${previewId}/commit`)
      .set(manager.auth)
      .expect(200);
    const d = res.body.data;
    commitId = d.job.id;
    expect(d.job).toMatchObject({ dryRun: false, status: 'completed_with_errors' });
    expect(d.summary).toMatchObject({ create: 2, duplicate: 1, invalid: 1 });
    const created = await t.prisma.vehicleVariant.findMany({
      where: { slug: { in: [BEV, PHEV] } },
      select: { slug: true, status: true, powertrainType: true },
    });
    expect(created).toHaveLength(2);
    expect(created.every((v) => v.status === 'draft')).toBe(true);

    const again = await t
      .http()
      .post(`/api/v1/admin/vehicles/import/jobs/${previewId}/commit`)
      .set(manager.auth)
      .expect(200);
    expect(again.body.data.job.id).toBe(commitId);
    expect(
      await t.prisma.vehicleVariant.count({
        where: { modelYear: { generation: { model: { slug: 'csvtest-motors-nova' } } } },
      }),
    ).toBe(2);
    const preview = await t
      .http()
      .get(`/api/v1/admin/vehicles/import/jobs/${previewId}`)
      .set(manager.auth)
      .expect(200);
    expect(preview.body.data).toMatchObject({
      committedJobId: commitId,
      job: { status: 'completed' },
    });
  });

  it('re-importing the same file changes nothing', async () => {
    const res = await upload(manager, 'variants', csv(VARIANTS), false).expect(200);
    expect(res.body.data.summary).toMatchObject({
      create: 0,
      update: 0,
      unchanged: 2,
      duplicate: 1,
      invalid: 1,
    });
    expect(
      await t.prisma.vehicleVariant.count({
        where: { slug: { startsWith: 'csvtest-motors-nova' } },
      }),
    ).toBe(2);
    const changed = [...VARIANTS.slice(0, 2)];
    changed[1] = changed[1].replace(',rwd,5', ',awd,5');
    const upd = await upload(manager, 'variants', csv(changed), false).expect(200);
    expect(upd.body.data.summary).toMatchObject({ update: 1 });
  });

  it('imports markets, specs (canonical units), ranges and consumption with row-level rules', async () => {
    const markets = await upload(
      manager,
      'variant_markets',
      csv([
        'variant_slug,market,availability,local_name_en',
        `${BEV},EG,available,Nova Base EG`,
        `${PHEV},EG,available,`,
        `${BEV},ZZ,available,`,
        `no-such-variant,EG,available,`,
      ]),
      false,
    ).expect(200);
    expect(markets.body.data.summary).toMatchObject({ create: 2, invalid: 2 });

    const source = await t
      .http()
      .post('/api/v1/admin/spec-sources')
      .set(manager.auth)
      .send({ type: 'manufacturer', title: 'CSV test sheet (fictional)' })
      .expect(201);
    const sourceId = source.body.data.id as string;
    const specs = await upload(
      writer,
      'specs',
      csv([
        'variant_slug,spec_key,market,value,unit,original_value,original_unit,reliability,source_id',
        `${BEV},battery.usable_kwh,,77.5,,,,manufacturer_claim,${sourceId}`,
        `${BEV},performance.power_kw,,340,PS,,,,`,
        `${BEV},battery.chemistry,,"=HYPERLINK(""x"")",,,,,`,
        `${BEV},safety.aeb,,نعم,,,,,`,
        `${BEV},battery.gross_kwh,,80,,,,verified,${sourceId}`,
        `${BEV},no.key,,1,,,,,`,
        `${PHEV},charging.ac_max_kw,,6.6,,,,,`,
      ]),
      false,
    ).expect(200);
    const s = specs.body.data;
    expect(s.summary).toMatchObject({ create: 5, invalid: 2 });
    const forbidden = s.rows.find((r: { rowNumber: number }) => r.rowNumber === 5);
    expect(forbidden.errors[0].code).toBe('verify_permission_required');
    const power = await t.prisma.vehicleSpecification.findFirstOrThrow({
      where: { variant: { slug: BEV }, specKey: 'performance.power_kw' },
    });
    expect(Number(power.valueNum)).toBeCloseTo(250.07, 1);
    expect(power).toMatchObject({ originalValue: '340', originalUnit: 'PS', unit: 'kW' });

    const ranges = await upload(
      manager,
      'ranges',
      csv([
        'variant_slug,market,cycle,range_type,value,unit',
        `${BEV},,WLTP,electric,300,mi`,
        `${BEV},,WLTP,total,900,`,
        `${PHEV},,WLTP,total,1000,`,
        `${PHEV},,NEDC,electric,90,`,
        `${BEV},,OTHER,electric,500,`,
      ]),
      false,
    ).expect(200);
    const r = ranges.body.data;
    expect(r.summary).toMatchObject({ create: 3, invalid: 2 });
    expect(r.rows.find((x: { rowNumber: number }) => x.rowNumber === 2).errors[0].code).toBe(
      'not_applicable_to_powertrain',
    );
    expect(r.rows.find((x: { rowNumber: number }) => x.rowNumber === 5).errors[0].field).toBe(
      'cycle_note',
    );
    const bevRange = await t.prisma.rangeMeasurement.findFirstOrThrow({
      where: { variant: { slug: BEV } },
    });
    expect(Number(bevRange.valueKm)).toBeCloseTo(482.8, 1);

    const cons = await upload(
      manager,
      'consumption',
      csv([
        'variant_slug,cycle,kind,mode,value,unit',
        `${PHEV},WLTP,fuel,charge_sustaining,5.3,`,
        `${BEV},WLTP,fuel,,5.3,`,
        `${BEV},WLTP,electricity,,6.2,km/kWh`,
      ]),
      false,
    ).expect(200);
    expect(cons.body.data.summary).toMatchObject({ create: 2, invalid: 1 });

    const times = await upload(
      manager,
      'charging_times',
      csv([
        'variant_slug,current_type,from_soc,to_soc,duration,charger_power_kw,conditions',
        `${BEV},DC,10,80,28,150,`,
        `${BEV},DC,80,10,28,150,`,
        `${BEV},DC,10,80,40,,`,
        `${BEV},AC,0,100,7.5,11,`,
      ]),
      false,
    ).expect(200);
    expect(times.body.data.summary).toMatchObject({ create: 2, invalid: 2 });
  });

  it('prices: permission, source, local currency, history — never converted', async () => {
    const header =
      'variant_slug,market,amount,currency,price_type,effective_from,effective_to,source_title,source_type,source_url';
    await upload(
      writer,
      'prices',
      csv([header, `${BEV},EG,1500000,EGP,official_msrp,2025-01-01,,,,`]),
      false,
    ).expect(403);
    const res = await upload(
      manager,
      'prices',
      csv([
        header,
        `${BEV},EG,1500000,EGP,official_msrp,2025-01-01,,Test price list (fictional),official_document,https://example.com/prices`,
        `${BEV},EG,1500000,EGP,official_msrp,2025-01-01,,,,`,
        `${BEV},EG,1650000,EGP,official_msrp,2025-07-01,,,,https://example.com/prices`,
        `${BEV},EG,31000,USD,official_msrp,2025-02-01,,,,https://example.com/prices`,
        `${BEV},EG,32000,USD,market_estimate,2025-02-01,,,,`,
        `${BEV},SA,120000,SAR,official_msrp,2025-02-01,,,,https://example.com/prices`,
        `${BEV},EG,abc,EGP,dealer,2025-03-01,,,,`,
      ]),
      false,
    ).expect(200);
    const d = res.body.data;
    expect(d.summary).toMatchObject({ create: 3, duplicate: 1, invalid: 3 });
    expect(d.rows.find((r: { rowNumber: number }) => r.rowNumber === 2).status).toBe('duplicate');
    expect(d.rows.find((r: { rowNumber: number }) => r.rowNumber === 4).errors[0].field).toBe(
      'currency',
    );
    expect(d.rows.find((r: { rowNumber: number }) => r.rowNumber === 6).errors[0].field).toBe(
      'market',
    );
    expect(d.rows.find((r: { rowNumber: number }) => r.rowNumber === 7).errors[0].field).toBe(
      'amount',
    );
    const noSource = await upload(
      manager,
      'prices',
      csv([header, `${BEV},EG,1400000,EGP,dealer,2025-03-01,,,,`]),
      false,
    ).expect(200);
    expect(noSource.body.data.rows[0].errors[0].field).toBe('source_id');

    const history = await t.prisma.priceHistory.findMany({
      where: { variant: { slug: BEV }, marketCode: 'EG', priceType: 'official_msrp' },
      orderBy: { effectiveFrom: 'asc' },
    });
    expect(
      history.map((p) => [
        p.effectiveFrom.toISOString().slice(0, 10),
        p.effectiveTo?.toISOString().slice(0, 10) ?? null,
        p.amount.toFixed(2),
        p.currencyCode,
      ]),
    ).toEqual([
      ['2025-01-01', '2025-06-30', '1500000.00', 'EGP'],
      ['2025-07-01', null, '1650000.00', 'EGP'],
    ]);
    const same = await upload(
      manager,
      'prices',
      csv([header, `${BEV},EG,1500000,EGP,official_msrp,2025-01-01,,,,https://example.com/prices`]),
      false,
    ).expect(200);
    expect(same.body.data.summary).toMatchObject({ unchanged: 1 });
  });

  it('export is restricted, audited and round-trips as unchanged', async () => {
    await t.http().get('/api/v1/admin/vehicles/export/specs').set(manager.auth).expect(403); // no data.export
    await t.http().get('/api/v1/admin/vehicles/export/specs').set(editor.auth).expect(403);
    const res = await t
      .http()
      .get('/api/v1/admin/vehicles/export/specs?brand=csvtest-motors')
      .set(admin.auth)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const lines = res.text.replace('\uFEFF', '').trim().split('\n');
    expect(lines).toHaveLength(6);
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
    const audit = await waitForAudit(t, 'vehicles.export');
    expect(audit.actorId).toBe(admin.id);

    const again = await upload(admin, 'specs', Buffer.from(res.text, 'utf8'), false).expect(200);
    expect(again.body.data.summary).toMatchObject({ total: 5, unchanged: 5, create: 0, update: 0 });
    const chem = await t.prisma.vehicleSpecification.findFirstOrThrow({
      where: { variant: { slug: BEV }, specKey: 'battery.chemistry' },
    });
    expect(chem.valueText).toBe('=HYPERLINK("x")');

    for (const type of [
      'variants',
      'variant_markets',
      'ranges',
      'consumption',
      'charging_times',
      'prices',
    ]) {
      const out = await t
        .http()
        .get(`/api/v1/admin/vehicles/export/${type}?brand=csvtest-motors`)
        .set(admin.auth)
        .expect(200);
      const back = await upload(admin, type, Buffer.from(out.text, 'utf8'), false).expect(200);
      const sum = back.body.data.summary;
      expect({ type, ...sum }).toMatchObject({ type, create: 0, update: 0, invalid: 0, failed: 0 });
      expect(sum.unchanged).toBe(sum.total);
    }
  });
});
