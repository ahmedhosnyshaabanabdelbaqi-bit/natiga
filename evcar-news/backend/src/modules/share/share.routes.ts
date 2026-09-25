import { RequestMethod } from '@nestjs/common';

/** Structurally identical to Nest's RouteInfo (not re-exported by @nestjs/common 12). */
export interface PublicRoute {
  path: string;
  method: RequestMethod;
}

/**
 * Public routes served OUTSIDE the /api/v1 prefix by the share module
 * (contract §7). Bootstrap excludes them from the global prefix; the share
 * module owns this list and may extend it.
 */
export const SHARE_PUBLIC_ROUTES: PublicRoute[] = [
  { path: 'n/:slug', method: RequestMethod.GET },
  { path: 'cars/:slug', method: RequestMethod.GET },
  { path: 'compare/:shareId', method: RequestMethod.GET },
  { path: '.well-known/assetlinks.json', method: RequestMethod.GET },
  { path: '.well-known/apple-app-site-association', method: RequestMethod.GET },
];
