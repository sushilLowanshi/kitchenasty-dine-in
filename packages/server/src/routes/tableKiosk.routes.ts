import { Router } from 'express';
import { authenticate, requireStaff, requireRole } from '../middleware/auth.js';
import {
  createTableKiosk,
  getTableKiosk,
  listTableKiosks,
  updateTableKiosk,
} from '../controllers/tableKiosk.controller.js';

const router = Router();

router.get('/', authenticate, requireStaff, requireRole('SUPER_ADMIN', 'MANAGER'), listTableKiosks);
router.post('/', authenticate, requireStaff, requireRole('SUPER_ADMIN', 'MANAGER'), createTableKiosk);
router.get('/:id', getTableKiosk);
router.patch('/:id', authenticate, requireStaff, requireRole('SUPER_ADMIN', 'MANAGER'), updateTableKiosk);

export default router;
