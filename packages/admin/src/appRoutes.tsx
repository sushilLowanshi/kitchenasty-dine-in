import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import RequireRole from './components/RequireRole.js';
import Dashboard from './pages/Dashboard.js';
import CategoryList from './pages/CategoryList.js';
import CategoryForm from './pages/CategoryForm.js';
import MenuItemList from './pages/MenuItemList.js';
import MenuItemForm from './pages/MenuItemForm.js';
import OrderList from './pages/OrderList.js';
import OrderDetailPage from './pages/OrderDetail.js';
import ReservationList from './pages/ReservationList.js';
import ReservationDetail from './pages/ReservationDetail.js';
import ReservationTrends from './pages/ReservationTrends.js';
import CouponList from './pages/CouponList.js';
import CouponForm from './pages/CouponForm.js';
import ReviewList from './pages/ReviewList.js';
import KitchenDisplay from './pages/KitchenDisplay.js';
import AutomationRuleList from './pages/AutomationRuleList.js';
import AutomationRuleForm from './pages/AutomationRuleForm.js';
import CustomerLoyalty from './pages/CustomerLoyalty.js';
import LegalPageList from './pages/LegalPageList.js';
import LegalPageForm from './pages/LegalPageForm.js';
import CookieCategoryList from './pages/CookieCategoryList.js';
import ConsentLog from './pages/ConsentLog.js';
import DesignLanding from './pages/DesignLanding.js';
import DesignBranding from './pages/DesignBranding.js';
import DesignTheme from './pages/DesignTheme.js';
import DesignTemplates from './pages/DesignTemplates.js';
import DesignGallery from './pages/DesignGallery.js';
import DesignMedia from './pages/DesignMedia.js';
import StaffList from './pages/StaffList.js';
import StaffInvite from './pages/StaffInvite.js';
import StaffEdit from './pages/StaffEdit.js';
import Settings from './pages/Settings.js';
import DeveloperMetrics from './pages/DeveloperMetrics.js';
import AuditLog from './pages/AuditLog.js';
import SettingsGeneral from './pages/SettingsGeneral.js';
import SettingsOrder from './pages/SettingsOrder.js';
import SettingsReservation from './pages/SettingsReservation.js';
import SettingsMail from './pages/SettingsMail.js';
import SettingsPayments from './pages/SettingsPayments.js';
import SettingsReviews from './pages/SettingsReviews.js';
import SettingsAdvanced from './pages/SettingsAdvanced.js';

/** Shared operational routes (relative paths) for admin + restaurant portals. */
export function SharedAppRoutes() {
  return (
    <>
      <Route index element={<Dashboard />} />
      <Route path="orders" element={<OrderList />} />
      <Route path="orders/:id" element={<OrderDetailPage />} />
      <Route path="reservations" element={<ReservationList />} />
      <Route path="reservations/trends" element={<ReservationTrends />} />
      <Route path="reservations/:id" element={<ReservationDetail />} />
      <Route path="reviews" element={<ReviewList />} />
      <Route path="kitchen" element={<KitchenDisplay />} />

      <Route path="menu" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><Navigate to="items" replace /></RequireRole>} />
      <Route path="menu/categories" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><CategoryList /></RequireRole>} />
      <Route path="menu/categories/new" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><CategoryForm /></RequireRole>} />
      <Route path="menu/categories/:id" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><CategoryForm /></RequireRole>} />
      <Route path="menu/items" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><MenuItemList /></RequireRole>} />
      <Route path="menu/items/new" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><MenuItemForm /></RequireRole>} />
      <Route path="menu/items/:id" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><MenuItemForm /></RequireRole>} />
      <Route path="coupons" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><CouponList /></RequireRole>} />
      <Route path="coupons/new" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><CouponForm /></RequireRole>} />
      <Route path="coupons/:id" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><CouponForm /></RequireRole>} />
      <Route path="automation" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><AutomationRuleList /></RequireRole>} />
      <Route path="automation/new" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><AutomationRuleForm /></RequireRole>} />
      <Route path="automation/:id" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><AutomationRuleForm /></RequireRole>} />
      <Route path="loyalty" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><CustomerLoyalty /></RequireRole>} />
      <Route path="design" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><Navigate to="landing" replace /></RequireRole>} />
      <Route path="design/landing" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><DesignLanding /></RequireRole>} />
      <Route path="design/branding" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><DesignBranding /></RequireRole>} />
      <Route path="design/theme" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><DesignTheme /></RequireRole>} />
      <Route path="design/templates" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><DesignTemplates /></RequireRole>} />
      <Route path="design/gallery" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><DesignGallery /></RequireRole>} />
      <Route path="design/media" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><DesignMedia /></RequireRole>} />
      <Route path="legal" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><Navigate to="pages" replace /></RequireRole>} />
      <Route path="legal/pages" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><LegalPageList /></RequireRole>} />
      <Route path="legal/pages/:slug" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><LegalPageForm /></RequireRole>} />
      <Route path="legal/cookies" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><CookieCategoryList /></RequireRole>} />
      <Route path="legal/consent" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><ConsentLog /></RequireRole>} />

      <Route path="settings" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><Settings /></RequireRole>} />
      <Route path="settings/general" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><SettingsGeneral /></RequireRole>} />
      <Route path="settings/order" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><SettingsOrder /></RequireRole>} />
      <Route path="settings/reservation" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><SettingsReservation /></RequireRole>} />
      <Route path="settings/mail" element={<RequireRole roles={['SUPER_ADMIN']}><SettingsMail /></RequireRole>} />
      <Route path="settings/payment" element={<RequireRole roles={['SUPER_ADMIN']}><SettingsPayments /></RequireRole>} />
      <Route path="settings/review" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><SettingsReviews /></RequireRole>} />
      <Route path="settings/advanced" element={<RequireRole roles={['SUPER_ADMIN']}><SettingsAdvanced /></RequireRole>} />

      <Route path="developer" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><Navigate to="metrics" replace /></RequireRole>} />
      <Route path="developer/metrics" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><DeveloperMetrics /></RequireRole>} />
      <Route path="developer/audit-log" element={<RequireRole roles={['SUPER_ADMIN']}><AuditLog /></RequireRole>} />

      <Route path="staff" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><StaffList /></RequireRole>} />
      <Route path="staff/invite" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><StaffInvite /></RequireRole>} />
      <Route path="staff/:id" element={<RequireRole roles={['SUPER_ADMIN', 'MANAGER']}><StaffEdit /></RequireRole>} />
    </>
  );
}
