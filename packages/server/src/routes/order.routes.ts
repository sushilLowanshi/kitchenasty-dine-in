import { Router } from 'express';
import { authenticate, optionalAuth, requireStaff } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createOrder, listOrders, listCustomerOrders, getOrder, updateOrderStatus, cancelOrder, addOrderItems } from '../controllers/order.controller.js';

const router = Router();

// Customer creates order (optionalAuth - allows guest checkout)
router.post('/', optionalAuth, asyncHandler(createOrder));

// Customer: view own orders
router.get('/my-orders', authenticate, asyncHandler(listCustomerOrders));

// Staff: list and manage orders
router.get('/', authenticate, requireStaff, asyncHandler(listOrders));
router.get('/:id', optionalAuth, asyncHandler(getOrder));
router.post('/:id/items', optionalAuth, asyncHandler(addOrderItems));
router.patch('/:id/status', authenticate, requireStaff, asyncHandler(updateOrderStatus));
// Customer/guest cancel while Confirmed
router.post('/:id/cancel', optionalAuth, asyncHandler(cancelOrder));

export default router;
