/**
 * Public API of the tours module for other modules:
 *
 *   import { ToursPublicService, TOUR_EVENTS, publicTourWhere } from '../tours';
 */
export { ToursModule } from './tours.module';
export { ToursAdminService, TOUR_EVENTS, type TourEvent } from './services/tours-admin.service';
export { ToursPublicService, publicTourWhere } from './services/tours-public.service';
export { toPlainText } from './domain/plain-text';
