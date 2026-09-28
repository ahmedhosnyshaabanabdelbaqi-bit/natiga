import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";
import { calculateEmployee } from "../server/payroll.js";

test("individual employee rules override payroll defaults", () => {
  const employee = {
    id: "employee", employee_no: "E-1", name: "Employee", monthly_salary: 6000,
    job_type: "nurse", department: "NICU", daily_work_hours: 6, work_days_per_month: 20,
    absence_deduction: 425, overtime_hour_rate: 80,
  };
  const policy = { working_days_per_month: 30, working_hours_per_day: 8, grace_minutes: 0, paid_break_minutes: 0, late_multiplier: 1, absence_multiplier: 1, overtime_multiplier: 1.5 };
  const absent = calculateEmployee(employee, [{ id: "absent", shift_date: "2026-01-01", starts_at: "2026-01-01T06:00:00Z", ends_at: "2026-01-01T12:00:00Z" }], [], policy);
  assert.equal(absent.absence_deduction, 425);
  assert.equal(absent.daily_work_hours, 6);
  assert.equal(absent.work_days_per_month, 20);
  assert.equal(absent.overtime_hour_rate, 80);
  const overtime = calculateEmployee(employee, [{ id: "worked", shift_date: "2026-01-02", starts_at: "2026-01-02T06:00:00Z", ends_at: "2026-01-02T12:00:00Z" }], [
    { id: "in", event: "in", occurred_at: "2026-01-02T06:00:00Z" },
    { id: "out", event: "out", occurred_at: "2026-01-02T13:00:00Z" },
  ], policy);
  assert.equal(overtime.overtime_pay, 80);
});

test("employee profiles, personal shift handover, password changes and safe account deletion", { timeout: 60000 }, async () => {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const app = await createApp(db, { seed: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookies: Record<string, string> = {};
  async function request(role: string, method: string, path: string, body?: unknown, expected = 200) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: { Origin: base, "Content-Type": "application/json", ...(cookies[role] ? { Cookie: cookies[role] } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.headers.get("set-cookie")) cookies[role] = response.headers.get("set-cookie")!.split(";")[0];
    const value = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
    return value;
  }
  const login = (role: string, username = role, password = "Training@2026") => request(role, "POST", "/login", { username, password });
  const keyed = (body: Record<string, unknown>) => ({ ...body, idempotency_key: randomUUID() });
  try {
    for (const role of ["manager", "nurse", "doctor", "admin"]) await login(role);
    const outgoing = await request("manager", "POST", "/attendance/employees", keyed({
      name: "ممرضة تسليم", employee_no: "HAND-1", device_pin: "HAND-1", user_id: "nurse",
      job_type: "nurse", job_title: "ممرضة حضّانات", department: "NICU", phone: "01000000000",
      hire_date: "2025-01-01", notes: "دوام ثابت", monthly_salary: 7000,
      daily_work_hours: 6, work_days_per_month: 24, absence_deduction: 300, overtime_hour_rate: 75,
    }), 201);
    const receiving = await request("manager", "POST", "/attendance/employees", keyed({
      name: "طبيب استلام", employee_no: "HAND-2", device_pin: "HAND-2", user_id: "doctor",
      job_type: "doctor", department: "NICU", monthly_salary: 12000,
      daily_work_hours: 8, work_days_per_month: 20,
    }), 201);
    assert.equal(outgoing.job_type, "nurse");
    assert.equal(Number(outgoing.daily_work_hours), 6);
    assert.equal(Number(outgoing.absence_deduction), 300);
    const edited = await request("manager", "PATCH", `/attendance/employees/${outgoing.id}`, keyed({
      version: outgoing.version, daily_work_hours: 8, work_days_per_month: 26,
      monthly_salary: 7500, absence_deduction: 320, overtime_hour_rate: 90,
    }));
    assert.equal(Number(edited.daily_work_hours), 8);
    const shift = await request("manager", "POST", "/attendance/shifts", keyed({
      employee_id: outgoing.id, shift_date: "2026-07-15", start_time: "08:00", end_time: "16:00",
    }), 201);
    const handover = await request("nurse", "POST", "/attendance/handovers", keyed({
      shift_id: shift.id, to_employee_id: receiving.id, summary: "تم تسليم مهام الشيفت والمفاتيح",
    }), 201);
    await request("nurse", "POST", `/attendance/handovers/${handover.id}/acknowledge`, keyed({ version: handover.version }), 403);
    const acknowledged = await request("doctor", "POST", `/attendance/handovers/${handover.id}/acknowledge`, keyed({ version: handover.version }));
    assert.equal(acknowledged.status, "acknowledged");

    const numeric = await request("admin", "POST", "/users", keyed({
      name: "حساب ثماني", username: "eight-digits", password: "12345678", role: "reception",
    }), 201);
    await login("temporary", "eight-digits", "12345678");
    const changed = await request("admin", "PATCH", `/users/${numeric.id}`, keyed({
      version: numeric.version, password: "abcdefgh", name: "حساب معدل", username: "eight-digits", role: "reception", active: true,
    }));
    assert.equal(changed.name, "حساب معدل");
    await login("temporary-new", "eight-digits", "abcdefgh");
    await request("admin", "PATCH", `/users/${numeric.id}`, keyed({ version: changed.version, password: "1234567" }), 400);

    const unused = await request("admin", "POST", "/users", keyed({
      name: "حساب للحذف", username: "delete-unused", password: "!!!!!!!!", role: "quality",
    }), 201);
    const deleted = await request("admin", "DELETE", `/users/${unused.id}`, keyed({ version: unused.version }));
    assert.equal(deleted.deleted, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  }
});
