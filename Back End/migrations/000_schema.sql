-- ---------------------------------------------------------------------------
-- 000_schema.sql
--
-- The complete Rolaz Cutz database schema (MySQL 8.4). Run it ONCE on a new,
-- empty database, then run 001_seed.sql:
--
--     mysql -h <host> -u <user> -p barbershop < "Back End/migrations/000_schema.sql"
--     mysql -h <host> -u <user> -p barbershop < "Back End/migrations/001_seed.sql"
--
-- Built from the development database on 2026-11-16 (MySQL 8.4.11), with:
--   - one foreign key per column (the dump repeated each one up to 42 times)
--   - Staff.pin replaced by Staff.pin_hash (reset PINs are stored hashed)
--   - User_Upload.customer_id nullable, so guest bookings can attach photos
--
-- All DATETIME columns are UTC. The API sets time_zone = '+00:00' on every
-- connection. Later schema changes go in new numbered files (002_..., 003_...).
-- ---------------------------------------------------------------------------

SET time_zone = '+00:00';

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE Service (
  service_id int NOT NULL AUTO_INCREMENT,
  slug varchar(50) NOT NULL COMMENT 'Public ID used by the API, e.g. regular',
  kind enum('service','upgrade') NOT NULL DEFAULT 'service',
  name varchar(100) NOT NULL,
  description text,
  price decimal(10,2) DEFAULT NULL COMMENT 'Legacy dollars. Use price_cents.',
  price_cents int NOT NULL,
  duration_minutes int NOT NULL,
  is_active tinyint(1) NOT NULL DEFAULT '1',
  display_order int NOT NULL DEFAULT '0',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (service_id),
  UNIQUE KEY uq_service_slug (slug),
  CONSTRAINT chk_service_duration CHECK ((duration_minutes > 0)),
  CONSTRAINT chk_service_price_cents CHECK ((price_cents >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Service_Upgrade_Compatibility (
  upgrade_id int NOT NULL COMMENT 'Service row with kind = upgrade',
  service_id int NOT NULL COMMENT 'Service row with kind = service',
  PRIMARY KEY (upgrade_id, service_id),
  KEY idx_compat_service (service_id),
  CONSTRAINT fk_compat_service FOREIGN KEY (service_id) REFERENCES Service (service_id) ON DELETE CASCADE,
  CONSTRAINT fk_compat_upgrade FOREIGN KEY (upgrade_id) REFERENCES Service (service_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

CREATE TABLE Staff (
  staff_id int NOT NULL AUTO_INCREMENT,
  name varchar(100) NOT NULL,
  username varchar(50) NOT NULL,
  password_hash varchar(255) NOT NULL,
  role enum('admin','barber') NOT NULL,
  specialty varchar(100) DEFAULT NULL,
  phone varchar(20) DEFAULT NULL,
  email varchar(100) DEFAULT NULL,
  pin_hash varchar(255) DEFAULT NULL COMMENT 'Hash of the 6-digit password-reset PIN (set_admin_pin.py)',
  pin_failed_attempts int NOT NULL DEFAULT '0',
  pin_locked_until datetime DEFAULT NULL,
  PRIMARY KEY (staff_id),
  UNIQUE KEY username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Staff_Session (
  session_id int NOT NULL AUTO_INCREMENT,
  token_hash char(64) NOT NULL COMMENT 'SHA-256 of the bearer token',
  staff_id int NOT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at datetime NOT NULL,
  revoked_at datetime DEFAULT NULL,
  PRIMARY KEY (session_id),
  UNIQUE KEY uq_staff_session_token (token_hash),
  KEY idx_staff_session_staff (staff_id),
  CONSTRAINT fk_staff_session_staff FOREIGN KEY (staff_id) REFERENCES Staff (staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Weekly_Hours (
  hours_id int NOT NULL AUTO_INCREMENT,
  staff_id int NOT NULL,
  day_of_week tinyint NOT NULL,
  start_time time DEFAULT NULL,
  end_time time DEFAULT NULL,
  is_open tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (hours_id),
  UNIQUE KEY staff_id (staff_id, day_of_week),
  CONSTRAINT fk_weekly_hours_staff FOREIGN KEY (staff_id) REFERENCES Staff (staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Time_Slot (
  slot_id int NOT NULL AUTO_INCREMENT,
  staff_id int NOT NULL,
  slot_start datetime NOT NULL,
  slot_end datetime NOT NULL,
  is_blocked tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (slot_id),
  UNIQUE KEY staff_id (staff_id, slot_start),
  CONSTRAINT fk_time_slot_staff FOREIGN KEY (staff_id) REFERENCES Staff (staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

CREATE TABLE Customer (
  customer_id int NOT NULL AUTO_INCREMENT,
  preferred_service_id int DEFAULT NULL,
  first_name varchar(50) NOT NULL,
  last_name varchar(50) NOT NULL DEFAULT '',
  username varchar(50) DEFAULT NULL,
  password_hash varchar(255) DEFAULT NULL COMMENT 'Legacy. Customers sign in with SMS codes.',
  phone varchar(20) NOT NULL,
  phone_e164 varchar(16) DEFAULT NULL COMMENT 'Verified phone in E.164 format',
  phone_verified_at datetime DEFAULT NULL,
  email varchar(100) DEFAULT NULL,
  date_of_birth date DEFAULT NULL,
  processor_customer_id varchar(100) DEFAULT NULL COMMENT 'Stripe (or similar) token. Never store raw card numbers',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id),
  UNIQUE KEY username (username),
  UNIQUE KEY email (email),
  UNIQUE KEY uq_customer_phone_e164 (phone_e164),
  KEY preferred_service_id (preferred_service_id),
  CONSTRAINT fk_customer_preferred_service FOREIGN KEY (preferred_service_id) REFERENCES Service (service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Customer_Session (
  session_id int NOT NULL AUTO_INCREMENT,
  token_hash char(64) NOT NULL COMMENT 'SHA-256 of the cookie token. The raw token is never stored.',
  customer_id int NOT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at datetime NOT NULL,
  revoked_at datetime DEFAULT NULL,
  PRIMARY KEY (session_id),
  UNIQUE KEY uq_customer_session_token (token_hash),
  KEY idx_customer_session_customer (customer_id),
  CONSTRAINT fk_customer_session_customer FOREIGN KEY (customer_id) REFERENCES Customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Phone_Verification (
  verification_id int NOT NULL AUTO_INCREMENT,
  phone_e164 varchar(16) NOT NULL,
  intent enum('register','login') NOT NULL,
  code_hash char(64) DEFAULT NULL COMMENT 'HMAC of the code; NULL when the SMS provider checks the code',
  request_ip varchar(45) NOT NULL,
  attempts int NOT NULL DEFAULT '0',
  created_at datetime NOT NULL,
  expires_at datetime NOT NULL,
  consumed_at datetime DEFAULT NULL,
  PRIMARY KEY (verification_id),
  KEY idx_verification_phone (phone_e164, created_at),
  KEY idx_verification_ip (request_ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------

CREATE TABLE Appointment (
  appointment_id int NOT NULL AUTO_INCREMENT,
  customer_id int DEFAULT NULL COMMENT 'Owning customer account. NULL for guest and staff-entered bookings.',
  staff_id int NOT NULL,
  start_time datetime NOT NULL COMMENT 'UTC',
  end_time datetime NOT NULL COMMENT 'UTC',
  status enum('booked','completed','canceled','no_show') NOT NULL DEFAULT 'booked',
  notes text,
  customer_name varchar(100) DEFAULT NULL COMMENT 'Snapshot at booking time',
  customer_phone varchar(16) DEFAULT NULL COMMENT 'Snapshot at booking time, E.164',
  customer_email varchar(100) DEFAULT NULL COMMENT 'Snapshot at booking time',
  payment_status varchar(30) NOT NULL DEFAULT 'Pay at Shop',
  payment_method varchar(30) NOT NULL DEFAULT 'shop',
  receipt_sent tinyint(1) NOT NULL DEFAULT '0',
  policy_version varchar(20) DEFAULT NULL,
  policy_accepted_at datetime DEFAULT NULL,
  guest_token_hash char(64) DEFAULT NULL COMMENT 'SHA-256 of the guest management token',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (appointment_id),
  UNIQUE KEY uq_appointment_guest_token (guest_token_hash),
  KEY customer_id (customer_id),
  KEY idx_appointment_staff_time (staff_id, start_time, end_time),
  CONSTRAINT fk_appointment_customer FOREIGN KEY (customer_id) REFERENCES Customer (customer_id),
  CONSTRAINT fk_appointment_staff FOREIGN KEY (staff_id) REFERENCES Staff (staff_id),
  CONSTRAINT chk_appointment_times CHECK ((end_time > start_time))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Appointment_Service (
  appointment_id int NOT NULL,
  service_id int NOT NULL,
  price_at_booking decimal(10,2) DEFAULT NULL COMMENT 'Legacy dollars. Use price_cents_at_booking.',
  line_order tinyint NOT NULL DEFAULT '0' COMMENT '0 = main service, then upgrades',
  name_at_booking varchar(100) DEFAULT NULL,
  price_cents_at_booking int DEFAULT NULL,
  duration_at_booking int DEFAULT NULL,
  PRIMARY KEY (appointment_id, service_id),
  KEY service_id (service_id),
  CONSTRAINT fk_appointment_service_appointment FOREIGN KEY (appointment_id) REFERENCES Appointment (appointment_id),
  CONSTRAINT fk_appointment_service_service FOREIGN KEY (service_id) REFERENCES Service (service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE User_Upload (
  upload_id int NOT NULL AUTO_INCREMENT,
  customer_id int DEFAULT NULL COMMENT 'Uploading customer account. NULL for guest bookings.',
  appointment_id int DEFAULT NULL,
  file_url varchar(255) NOT NULL COMMENT 'Storage key of the photo, e.g. appointments/12/<id>.jpg',
  uploaded_at datetime NOT NULL,
  PRIMARY KEY (upload_id),
  KEY customer_id (customer_id),
  KEY appointment_id (appointment_id),
  CONSTRAINT fk_user_upload_customer FOREIGN KEY (customer_id) REFERENCES Customer (customer_id),
  CONSTRAINT fk_user_upload_appointment FOREIGN KEY (appointment_id) REFERENCES Appointment (appointment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Review (
  review_id int NOT NULL AUTO_INCREMENT,
  customer_id int NOT NULL,
  staff_id int NOT NULL,
  appointment_id int NOT NULL,
  rating int NOT NULL COMMENT '1 to 5',
  comment text,
  created_at datetime NOT NULL,
  PRIMARY KEY (review_id),
  KEY customer_id (customer_id),
  KEY staff_id (staff_id),
  KEY appointment_id (appointment_id),
  CONSTRAINT fk_review_customer FOREIGN KEY (customer_id) REFERENCES Customer (customer_id),
  CONSTRAINT fk_review_staff FOREIGN KEY (staff_id) REFERENCES Staff (staff_id),
  CONSTRAINT fk_review_appointment FOREIGN KEY (appointment_id) REFERENCES Appointment (appointment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- Products and orders (not used by the launch site; kept for the store)
-- ---------------------------------------------------------------------------

CREATE TABLE Supplier (
  supplier_id int NOT NULL AUTO_INCREMENT,
  name varchar(100) NOT NULL,
  location varchar(150) DEFAULT NULL,
  contact_name varchar(100) DEFAULT NULL,
  phone varchar(20) DEFAULT NULL,
  email varchar(100) DEFAULT NULL,
  PRIMARY KEY (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Product_Category (
  category_id int NOT NULL AUTO_INCREMENT,
  parent_category_id int DEFAULT NULL COMMENT 'Optional, for subcategories',
  name varchar(100) NOT NULL,
  description text,
  PRIMARY KEY (category_id),
  KEY parent_category_id (parent_category_id),
  CONSTRAINT fk_product_category_parent FOREIGN KEY (parent_category_id) REFERENCES Product_Category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Product (
  product_id int NOT NULL AUTO_INCREMENT,
  category_id int NOT NULL,
  supplier_id int NOT NULL,
  name varchar(100) NOT NULL,
  brand varchar(100) DEFAULT NULL,
  description text,
  sku varchar(50) DEFAULT NULL,
  cost decimal(10,2) NOT NULL,
  price decimal(10,2) NOT NULL,
  stock_quantity int NOT NULL DEFAULT '0',
  PRIMARY KEY (product_id),
  UNIQUE KEY sku (sku),
  KEY category_id (category_id),
  KEY supplier_id (supplier_id),
  CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES Product_Category (category_id),
  CONSTRAINT fk_product_supplier FOREIGN KEY (supplier_id) REFERENCES Supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Cart (
  cart_id int NOT NULL AUTO_INCREMENT,
  customer_id int NOT NULL,
  created_at datetime NOT NULL,
  PRIMARY KEY (cart_id),
  KEY customer_id (customer_id),
  CONSTRAINT fk_cart_customer FOREIGN KEY (customer_id) REFERENCES Customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Cart_Item (
  cart_id int NOT NULL,
  product_id int NOT NULL,
  quantity int NOT NULL,
  PRIMARY KEY (cart_id, product_id),
  KEY product_id (product_id),
  CONSTRAINT fk_cart_item_cart FOREIGN KEY (cart_id) REFERENCES Cart (cart_id),
  CONSTRAINT fk_cart_item_product FOREIGN KEY (product_id) REFERENCES Product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Orders (
  order_id int NOT NULL AUTO_INCREMENT,
  customer_id int NOT NULL,
  order_date datetime NOT NULL,
  status enum('pending','paid','shipped','completed','canceled') NOT NULL DEFAULT 'pending',
  total_price decimal(10,2) NOT NULL,
  PRIMARY KEY (order_id),
  KEY customer_id (customer_id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES Customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Named Orders because ORDER is a reserved word in MySQL';

CREATE TABLE Order_Item (
  order_id int NOT NULL,
  product_id int NOT NULL,
  quantity int NOT NULL,
  unit_price decimal(10,2) NOT NULL,
  PRIMARY KEY (order_id, product_id),
  KEY product_id (product_id),
  CONSTRAINT fk_order_item_order FOREIGN KEY (order_id) REFERENCES Orders (order_id),
  CONSTRAINT fk_order_item_product FOREIGN KEY (product_id) REFERENCES Product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE Payment (
  payment_id int NOT NULL AUTO_INCREMENT,
  order_id int DEFAULT NULL,
  appointment_id int DEFAULT NULL,
  amount decimal(10,2) NOT NULL,
  method enum('card','cash','other') NOT NULL,
  status enum('pending','succeeded','failed','refunded') NOT NULL DEFAULT 'pending',
  processor_transaction_id varchar(100) DEFAULT NULL,
  paid_at datetime DEFAULT NULL,
  PRIMARY KEY (payment_id),
  KEY order_id (order_id),
  KEY appointment_id (appointment_id),
  CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES Orders (order_id),
  CONSTRAINT fk_payment_appointment FOREIGN KEY (appointment_id) REFERENCES Appointment (appointment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Exactly one of order_id or appointment_id should be set (enforce with a CHECK constraint)';
