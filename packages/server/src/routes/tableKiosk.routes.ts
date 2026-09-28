import { Router } from 'express';
import { authenticate, requireStaff, requireRole } from '../middleware/auth.js';
import {
  createTableKiosk,
  getTableKiosk,
  listTableKiosks,
  updateTableKiosk,
} from '../controllers/tableKiosk.controller.js';
import {
  getTableKioskCart,
  putTableKioskCart,
  getTableKioskSession,
} from '../controllers/tableCart.controller.js';

const router = Router();

// Any kitchen staff (MANAGER/STAFF/SUPER_ADMIN) can list screens to add table orders
router.get('/', authenticate, requireStaff, listTableKiosks);
router.post('/', authenticate, requireStaff, requireRole('SUPER_ADMIN', 'MANAGER'), createTableKiosk);

// Shared cart / session — public (table screens have no login)
router.get('/:id/cart', getTableKioskCart);
router.put('/:id/cart', putTableKioskCart);
router.get('/:id/session', getTableKioskSession);

router.get('/:id', getTableKiosk);
router.patch('/:id', authenticate, requireStaff, requireRole('SUPER_ADMIN', 'MANAGER'), updateTableKiosk);

export default router;
