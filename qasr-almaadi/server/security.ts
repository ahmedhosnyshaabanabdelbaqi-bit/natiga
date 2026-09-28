import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export const permissionList = [
  "radiology.read", "radiology.write", "pharmacy.read", "pharmacy.write", "surgery.read", "surgery.write",
  "consumables.read", "consumables.use", "consumables.catalog",
  "patients.read",
  "patients.write",
  "beds.write",
  "clinical.read",
  "clinical.write",
  "clinical.approve",
  "nursing.write",
  "lab.write",
  "stock.read",
  "stock.write",
  "billing.read",
  "billing.write",
  "prices.write",
  "reports.read",
  "print",
  "export",
  "settings.write",
  "audit.read",
  "operations.write",
  "attendance.read",
  "attendance.self",
  "attendance.write",
  "attendance.devices",
  "payroll.read",
  "payroll.write",
  "payroll.approve",
  "purchase.read",
  "purchase.request",
  "purchase.approve",
];
export const defaultRoles: Record<string, string[]> = {
  manager: [...permissionList],
  admin: [...permissionList],
  doctor: [
    "radiology.read", "pharmacy.read", "surgery.read", "surgery.write",
    "consumables.read", "consumables.use",
    "attendance.self",
    "patients.read",
    "clinical.read",
    "clinical.write",
    "clinical.approve",
    "reports.read",
    "print",
  ],
  nurse: ["radiology.read", "surgery.read", "consumables.read", "consumables.use", "attendance.self", "patients.read", "clinical.read", "nursing.write", "print"],
  head_nurse: [
    "radiology.read", "surgery.read",
    "consumables.read", "consumables.use",
    "attendance.read",
    "attendance.write",
    "patients.read",
    "clinical.read",
    "nursing.write",
    "beds.write",
    "operations.write",
    "reports.read",
    "print",
  ],
  reception: [
    "attendance.self",
    "patients.read",
    "patients.write",
    "beds.write",
    "operations.write",
    "purchase.read", "purchase.request",
    "print",
  ],
  accountant: [
    "consumables.read",
    "attendance.read",
    "payroll.read",
    "payroll.write",
    "patients.read",
    "billing.read",
    "billing.write",
    "purchase.read", "purchase.approve",
    "reports.read",
    "print",
    "export",
  ],
  purchasing: [
    "stock.read",
    "purchase.read", "purchase.request", "purchase.approve",
    "reports.read",
    "print",
    "export",
  ],
  insurance: [
    "attendance.self",
    "patients.read",
    "billing.read",
    "operations.write",
    "print",
    "export",
  ],
  lab: ["attendance.self", "patients.read", "lab.write", "print"],
  radiologist: ["attendance.self", "patients.read", "radiology.read", "radiology.write", "print"],
  pharmacist: ["attendance.self", "patients.read", "pharmacy.read", "pharmacy.write", "stock.read", "print"],
  stock: ["consumables.read", "consumables.use", "consumables.catalog", "attendance.self", "stock.read", "stock.write", "purchase.read", "purchase.request", "patients.read", "print", "export"],
  quality: [
    "attendance.self",
    "patients.read",
    "reports.read",
    "audit.read",
    "operations.write",
    "print",
    "export",
  ],
  maintenance: ["attendance.self", "beds.write", "operations.write", "print"],
};
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function sessionToken() {
  return randomBytes(32).toString("hex");
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export function required(value: any, label: string) {
  if (typeof value !== "string" || !value.trim())
    throw new ApiError(400, `يرجى إدخال ${label}`);
  return value.trim();
}
export function number(value: any, label: string, min = 0, max = 1e9) {
  const n = Number(value);
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(n) ||
    n < min ||
    n > max
  )
    throw new ApiError(400, `قيمة ${label} غير صالحة`);
  return n;
}
export function date(value: any, label: string) {
  const d = new Date(value);
  if (!value || !Number.isFinite(d.getTime()))
    throw new ApiError(400, `تاريخ ${label} غير صالح`);
  return d.toISOString();
}
export function choice(value: any, allowed: string[], label: string) {
  if (!allowed.includes(value)) throw new ApiError(400, `${label} غير صالح`);
  return value;
}
