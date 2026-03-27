# Database Setup

This folder contains the first-pass MySQL design for the shared customer/admin e-commerce and inventory system.

## Import

1. Import `main.sql`

## What The Database Covers

- shared `users` table for customers and admins
- first-admin registration support through `app_settings`
- product catalog with images and variant-level stock
- carts and checkout-ready orders
- payment transaction records
- shipment tracking
- incoming stock orders from suppliers
- inventory movement logging
- stock alerts
- admin notifications
- audit/activity logs
- reporting views for stock, outgoing orders, incoming orders, and dashboard metrics
- seeded roles, app settings, and the default admin account

## Important Implementation Notes

- Every sellable product should have at least one row in `product_variants`.
- For simple products with no size/color variations, create one default variant.
- The system uses one seeded admin account instead of first-admin self-registration.
- Stock reduction, stock alert creation, and admin notification creation should be handled in the PHP API whenever:
  - a customer places an order
  - an admin receives an incoming order
  - an admin manually adjusts stock

## Reporting Views

- `vw_product_inventory_status`: variant-level live stock status
- `vw_product_stock_summary`: product-level stock summary
- `vw_order_overview`: outgoing customer order summary
- `vw_incoming_order_overview`: incoming stock order summary
- `vw_daily_inventory_movements`: daily incoming/outgoing stock totals
- `vw_dashboard_metrics`: headline dashboard counts
