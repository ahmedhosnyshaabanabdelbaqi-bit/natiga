/**
 * Toolchain guard: every major runtime dependency the backend relies on must
 * load and work under Jest (several are ESM-only and go through
 * test/jest/esm-to-cjs.transformer.cjs). If this fails after an upgrade, fix
 * the toolchain before feature tests start failing in confusing ways.
 */
import { S3Client } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { XMLParser } from 'fast-xml-parser';
import { fileTypeFromBuffer } from 'file-type';
import { OAuth2Client } from 'google-auth-library';
import { generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { DateTime } from 'luxon';
import nodemailer from 'nodemailer';
import sharp from 'sharp';
import { v7 as uuidv7, validate as uuidValidate } from 'uuid';
import * as argon2 from 'argon2';

describe('runtime dependencies load under Jest', () => {
  it('argon2id hashes and verifies', async () => {
    const hash = await argon2.hash('correct horse', { type: argon2.argon2id });
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(hash, 'correct horse')).resolves.toBe(true);
    await expect(argon2.verify(hash, 'wrong')).resolves.toBe(false);
  });

  it('sharp creates and resizes images; file-type sniffs them', async () => {
    const png = await sharp({
      create: { width: 64, height: 32, channels: 3, background: '#0A5CFF' },
    })
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([64, 32]);
    const jpeg = await sharp(png).resize(32).jpeg({ quality: 60 }).toBuffer();
    expect((await fileTypeFromBuffer(jpeg))?.mime).toBe('image/jpeg');
    expect(await fileTypeFromBuffer(Buffer.from('not an image'))).toBeUndefined();
  });

  it('jose signs/verifies JWTs (Apple sign-in, APNs)', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwt = await new SignJWT({ sub: 'u1' })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const { payload } = await jwtVerify(jwt, publicKey);
    expect(payload.sub).toBe('u1');
  });

  it('uuid v7, csv, xml, luxon work', () => {
    const id = uuidv7();
    expect(uuidValidate(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect(parseCsv('a,b\n1,2\n', { columns: true })).toEqual([{ a: '1', b: '2' }]);
    expect(stringifyCsv([{ a: 1, b: 'x,y' }], { header: true })).toBe('a,b\n1,"x,y"\n');
    const xml = new XMLParser().parse('<rss><channel><title>t</title></channel></rss>') as {
      rss: { channel: { title: string } };
    };
    expect(xml.rss.channel.title).toBe('t');
    expect(DateTime.fromISO('2025-01-01T12:00:00Z').setZone('Africa/Cairo').toFormat('HH:mm')).toBe(
      '14:00',
    );
  });

  it('SDK clients can be constructed without network access', async () => {
    expect(new OAuth2Client()).toBeDefined();
    const s3 = new S3Client({
      region: 'us-east-1',
      endpoint: 'http://localhost:9',
      credentials: { accessKeyId: 'x', secretAccessKey: 'y' },
    });
    s3.destroy();
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const info = await transport.sendMail({
      from: 'a@b.co',
      to: 'c@d.co',
      subject: 'hi',
      text: 'x',
    });
    expect((JSON.parse(info.message as unknown as string) as { subject: string }).subject).toBe(
      'hi',
    );
    expect(typeof Queue).toBe('function');
  });
});
