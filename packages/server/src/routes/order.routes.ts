import { Router } from 'express';
import { authenticate, optionalAuth, requireStaff, requireRole } from '../middleware/auth.js';
import { createOrder, listOrders, listCustomerOrders, getOrder, updateOrderStatus, cancelOrder, addOrderItems } from '../controllers/order.controller.js';

const router = Router();

// Customer creates order (optionalAuth - allows guest checkout)
router.post('/', optionalAuth, createOrder);

// Customer: view own orders
router.get('/my-orders', authenticate, listCustomerOrders);

// Staff: list and manage orders
router.get('/', authenticate, requireStaff, listOrders);
router.get('/:id', optionalAuth, getOrder);
router.post('/:id/items', optionalAuth, addOrderItems);
router.patch('/:id/status', authenticate, requireStaff, updateOrderStatus);
// Customer/guest cancel while Confirmed
router.post('/:id/cancel', optionalAuth, cancelOrder);

export default router;
