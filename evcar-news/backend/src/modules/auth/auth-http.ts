import { isIP } from 'node:net';
import { Header } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { RequestContext } from '../../common/context/request-context';
import type { AppConfig } from '../../config/app-config';
import type { ClientContext } from './services/auth.service';

/** httpOnly cookie holding the refresh token of web clients (contract §4.4.1). */
export const REFRESH_COOKIE = 'evcar_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
export const CLIENT_TYPE_HEADER = 'x-client-type';
/**
 * Opaque per-device id used to recognise a device that signed in before
 * (exempt from the account-wide login lock). Web: httpOnly cookie set by the
 * server; mobile: random installation id sent in the `X-Device-Id` header.
 */
export const DEVICE_COOKIE = 'evcar_dev';
export const DEVICE_ID_HEADER = 'x-device-id';
const DEVICE_ID_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_COOKIE_MAX_AGE_MS = 365 * 24 * 3600 * 1000;

/** Web clients send `X-Client-Type: web` and get the refresh token as a cookie. */
export function isWebClient(req: Request): boolean {
  const value = req.headers[CLIENT_TYPE_HEADER];
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim().toLowerCase() === 'web';
}

function cookieOf(req: Request, name: string): string | undefined {
  const cookies: unknown = (req as { cookies?: unknown }).cookies;
  const value: unknown =
    typeof cookies === 'object' && cookies !== null
      ? (cookies as Record<string, unknown>)[name]
      : undefined;
  return typeof value === 'string' && value ? value : undefined;
}

/** Device id of the request: the `evcar_dev` cookie (web) or `X-Device-Id` (others). */
export function deviceIdOf(req: Request): string | undefined {
  let raw: string | undefined;
  if (isWebClient(req)) {
    raw = cookieOf(req, DEVICE_COOKIE);
  } else {
    const header = req.headers[DEVICE_ID_HEADER];
    raw = Array.isArray(header) ? header[0] : header;
  }
  return raw && DEVICE_ID_SHAPE.test(raw) ? raw : undefined;
}

export function clientContextOf(req: Request): ClientContext {
  const ctx = RequestContext.get();
  const ua = req.headers['user-agent'];
  const ip = req.ip && isIP(req.ip) ? req.ip : undefined;
  return {
    clientType: isWebClient(req) ? 'web' : 'mobile',
    ip,
    userAgent: typeof ua === 'string' ? ua.slice(0, 512) : undefined,
    lang: ctx?.lang ?? 'ar',
    deviceId: deviceIdOf(req),
  };
}

/** Web: (re)sets the long-lived device cookie after a successful sign-in. */
export function setDeviceCookie(res: Response, config: AppConfig, deviceId: string): void {
  res.cookie(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: DEVICE_COOKIE_MAX_AGE_MS,
  });
}

function cookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(
  res: Response,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions(config),
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(config));
}

/** Refresh token of the request: the cookie for web clients, the body otherwise. */
export function refreshTokenOf(req: Request, bodyToken: string | undefined): string | undefined {
  if (isWebClient(req)) return cookieOf(req, REFRESH_COOKIE);
  return bodyToken || undefined;
}

/** Responses carrying tokens or account state must never be cached. */
export const NoStore = () => Header('Cache-Control', 'no-store');
