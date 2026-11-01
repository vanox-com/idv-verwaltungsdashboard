-- MySQL 8: additional security tables needed by the PHP-only runtime.
-- Run after mysql8-schema.sql, mysql8 data import, and mysql8-revisions.sql.
CREATE TABLE IF NOT EXISTS `idv_login_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip_hash` BINARY(32) NOT NULL,
  `zeit` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idv_login_attempts_ip_time` (`ip_hash`,`zeit`),
  KEY `idv_login_attempts_cleanup` (`zeit`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
