-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 31-10-2026 a las 07:40:36
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `petcare`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `chat_conversaciones`
--

CREATE TABLE `chat_conversaciones` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `mascota_id` bigint(20) UNSIGNED DEFAULT NULL,
  `titulo` varchar(120) DEFAULT NULL,
  `creada_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizada_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `chat_mensajes`
--

CREATE TABLE `chat_mensajes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `conversacion_id` bigint(20) UNSIGNED NOT NULL,
  `emisor` enum('usuario','asistente') NOT NULL,
  `contenido` text NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `citas`
--

CREATE TABLE `citas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `mascota_id` bigint(20) UNSIGNED NOT NULL,
  `veterinaria_id` bigint(20) UNSIGNED NOT NULL,
  `motivo_id` bigint(20) UNSIGNED NOT NULL,
  `fecha_cita` date NOT NULL,
  `hora_cita` time NOT NULL,
  `estado` enum('pendiente','confirmada','completada','cancelada') NOT NULL DEFAULT 'pendiente',
  `notas` text DEFAULT NULL,
  `creado_por_id` bigint(20) UNSIGNED NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `horario_ocupado` tinyint(4) GENERATED ALWAYS AS (if(`estado` = 'cancelada',NULL,1)) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `identidades_externas`
--

CREATE TABLE `identidades_externas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `proveedor` enum('google','facebook') NOT NULL,
  `id_externo` varchar(190) NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mascotas`
--

CREATE TABLE `mascotas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `nombre` varchar(60) NOT NULL,
  `especie` enum('perro','gato') NOT NULL,
  `raza` varchar(80) DEFAULT NULL,
  `sexo` enum('macho','hembra') DEFAULT NULL,
  `color` varchar(60) DEFAULT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `fecha_adopcion` date DEFAULT NULL,
  `estado_salud` enum('excelente','bueno','en_seguimiento') NOT NULL DEFAULT 'bueno',
  `foto_url` varchar(500) DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mascota_pesos`
--

CREATE TABLE `mascota_pesos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `mascota_id` bigint(20) UNSIGNED NOT NULL,
  `peso_kg` decimal(5,2) NOT NULL,
  `fecha_registro` date NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `motivos_consulta`
--

CREATE TABLE `motivos_consulta` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `nombre` varchar(80) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `notificaciones`
--

CREATE TABLE `notificaciones` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `tipo` enum('cita_confirmada','cita_completada','recordatorio','vacuna_proxima','vacuna_vencida','novedad') NOT NULL,
  `titulo` varchar(120) NOT NULL,
  `mensaje` varchar(300) NOT NULL,
  `mascota_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cita_id` bigint(20) UNSIGNED DEFAULT NULL,
  `vacuna_aplicada_id` bigint(20) UNSIGNED DEFAULT NULL,
  `leida_en` datetime DEFAULT NULL,
  `creada_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `preferencias_usuario`
--

CREATE TABLE `preferencias_usuario` (
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `notif_recordatorio_vacunas` tinyint(1) NOT NULL DEFAULT 1,
  `notif_alerta_dia_anterior` tinyint(1) NOT NULL DEFAULT 1,
  `notif_vacunas_vencidas` tinyint(1) NOT NULL DEFAULT 1,
  `notif_confirmacion_cita` tinyint(1) NOT NULL DEFAULT 1,
  `notif_recordatorio_24h` tinyint(1) NOT NULL DEFAULT 1,
  `notif_push` tinyint(1) NOT NULL DEFAULT 1,
  `notif_email` tinyint(1) NOT NULL DEFAULT 1,
  `notif_actualizaciones` tinyint(1) NOT NULL DEFAULT 0,
  `perfil_publico` tinyint(1) NOT NULL DEFAULT 0,
  `compartir_datos_anonimos` tinyint(1) NOT NULL DEFAULT 0,
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `recordatorios`
--

CREATE TABLE `recordatorios` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `mascota_id` bigint(20) UNSIGNED NOT NULL,
  `titulo` varchar(120) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `fecha_recordatorio` date NOT NULL,
  `completado_en` datetime DEFAULT NULL,
  `creado_por_id` bigint(20) UNSIGNED NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `tokens_usuario`
--

CREATE TABLE `tokens_usuario` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` bigint(20) UNSIGNED NOT NULL,
  `tipo` enum('recuperar_contrasena','recordar_sesion') NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expira_en` datetime NOT NULL,
  `usado_en` datetime DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `rol` enum('administrador','usuario') NOT NULL DEFAULT 'usuario',
  `nombre_completo` varchar(120) NOT NULL,
  `correo` varchar(190) NOT NULL,
  `contrasena_hash` varchar(255) DEFAULT NULL,
  `telefono` varchar(25) DEFAULT NULL,
  `ubicacion` varchar(120) DEFAULT NULL,
  `avatar_url` varchar(500) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `correo_verificado_en` datetime DEFAULT NULL,
  `terminos_aceptados_en` datetime DEFAULT NULL,
  `ultimo_acceso_en` datetime DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `vacunas`
--

CREATE TABLE `vacunas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `especie` enum('perro','gato','ambas') NOT NULL DEFAULT 'ambas',
  `descripcion` varchar(255) DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `vacunas_aplicadas`
--

CREATE TABLE `vacunas_aplicadas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `mascota_id` bigint(20) UNSIGNED NOT NULL,
  `vacuna_id` bigint(20) UNSIGNED NOT NULL,
  `cita_id` bigint(20) UNSIGNED DEFAULT NULL,
  `veterinaria_id` bigint(20) UNSIGNED DEFAULT NULL,
  `fecha_aplicacion` date NOT NULL,
  `proxima_dosis` date DEFAULT NULL,
  `veterinario` varchar(120) DEFAULT NULL,
  `lote` varchar(60) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `registrado_por_id` bigint(20) UNSIGNED NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `veterinarias`
--

CREATE TABLE `veterinarias` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `direccion` varchar(255) NOT NULL,
  `ciudad` varchar(80) DEFAULT NULL,
  `telefono` varchar(25) DEFAULT NULL,
  `correo` varchar(190) DEFAULT NULL,
  `latitud` decimal(9,6) DEFAULT NULL,
  `longitud` decimal(9,6) DEFAULT NULL,
  `atiende_24h` tinyint(1) NOT NULL DEFAULT 0,
  `calificacion_promedio` decimal(2,1) NOT NULL DEFAULT 0.0,
  `total_resenas` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `logo_url` varchar(500) DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `veterinaria_etiquetas`
--

CREATE TABLE `veterinaria_etiquetas` (
  `veterinaria_id` bigint(20) UNSIGNED NOT NULL,
  `etiqueta` varchar(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `veterinaria_horarios`
--

CREATE TABLE `veterinaria_horarios` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `veterinaria_id` bigint(20) UNSIGNED NOT NULL,
  `dia_semana` tinyint(3) UNSIGNED NOT NULL,
  `hora_apertura` time NOT NULL,
  `hora_cierre` time NOT NULL
) ;

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `vista_carnet_vacunas`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `vista_carnet_vacunas` (
`id` bigint(20) unsigned
,`mascota_id` bigint(20) unsigned
,`usuario_id` bigint(20) unsigned
,`vacuna_id` bigint(20) unsigned
,`vacuna` varchar(100)
,`fecha_aplicacion` date
,`proxima_dosis` date
,`estado` varchar(9)
,`veterinaria_id` bigint(20) unsigned
,`veterinario` varchar(120)
,`lote` varchar(60)
,`observaciones` text
);

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `vista_mascotas_resumen`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `vista_mascotas_resumen` (
`id` bigint(20) unsigned
,`usuario_id` bigint(20) unsigned
,`nombre` varchar(60)
,`especie` enum('perro','gato')
,`raza` varchar(80)
,`sexo` enum('macho','hembra')
,`color` varchar(60)
,`fecha_nacimiento` date
,`edad_anios` bigint(21)
,`estado_salud` enum('excelente','bueno','en_seguimiento')
,`foto_url` varchar(500)
,`peso_actual_kg` decimal(5,2)
);

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `vista_resumen_inicio`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `vista_resumen_inicio` (
`usuario_id` bigint(20) unsigned
,`mascotas_registradas` bigint(21)
,`vacunas_proximas` bigint(21)
,`proximas_citas` bigint(21)
,`recordatorios_pendientes` bigint(21)
);

-- --------------------------------------------------------

--
-- Estructura para la vista `vista_carnet_vacunas`
--
DROP TABLE IF EXISTS `vista_carnet_vacunas`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_carnet_vacunas`  AS SELECT `t`.`id` AS `id`, `t`.`mascota_id` AS `mascota_id`, `m`.`usuario_id` AS `usuario_id`, `t`.`vacuna_id` AS `vacuna_id`, `v`.`nombre` AS `vacuna`, `t`.`fecha_aplicacion` AS `fecha_aplicacion`, `t`.`proxima_dosis` AS `proxima_dosis`, CASE WHEN `t`.`orden` > 1 OR `t`.`proxima_dosis` is null THEN 'al_dia' WHEN `t`.`proxima_dosis` < curdate() THEN 'pendiente' WHEN `t`.`proxima_dosis` <= curdate() + interval 90 day THEN 'proxima' ELSE 'al_dia' END AS `estado`, `t`.`veterinaria_id` AS `veterinaria_id`, `t`.`veterinario` AS `veterinario`, `t`.`lote` AS `lote`, `t`.`observaciones` AS `observaciones` FROM (((select `va`.`id` AS `id`,`va`.`mascota_id` AS `mascota_id`,`va`.`vacuna_id` AS `vacuna_id`,`va`.`cita_id` AS `cita_id`,`va`.`veterinaria_id` AS `veterinaria_id`,`va`.`fecha_aplicacion` AS `fecha_aplicacion`,`va`.`proxima_dosis` AS `proxima_dosis`,`va`.`veterinario` AS `veterinario`,`va`.`lote` AS `lote`,`va`.`observaciones` AS `observaciones`,`va`.`registrado_por_id` AS `registrado_por_id`,`va`.`creado_en` AS `creado_en`,`va`.`actualizado_en` AS `actualizado_en`,row_number() over ( partition by `va`.`mascota_id`,`va`.`vacuna_id` order by `va`.`fecha_aplicacion` desc,`va`.`id` desc) AS `orden` from `vacunas_aplicadas` `va`) `t` join `mascotas` `m` on(`m`.`id` = `t`.`mascota_id`)) join `vacunas` `v` on(`v`.`id` = `t`.`vacuna_id`)) ;

-- --------------------------------------------------------

--
-- Estructura para la vista `vista_mascotas_resumen`
--
DROP TABLE IF EXISTS `vista_mascotas_resumen`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_mascotas_resumen`  AS SELECT `m`.`id` AS `id`, `m`.`usuario_id` AS `usuario_id`, `m`.`nombre` AS `nombre`, `m`.`especie` AS `especie`, `m`.`raza` AS `raza`, `m`.`sexo` AS `sexo`, `m`.`color` AS `color`, `m`.`fecha_nacimiento` AS `fecha_nacimiento`, timestampdiff(YEAR,`m`.`fecha_nacimiento`,curdate()) AS `edad_anios`, `m`.`estado_salud` AS `estado_salud`, `m`.`foto_url` AS `foto_url`, (select `p`.`peso_kg` from `mascota_pesos` `p` where `p`.`mascota_id` = `m`.`id` order by `p`.`fecha_registro` desc,`p`.`id` desc limit 1) AS `peso_actual_kg` FROM `mascotas` AS `m` WHERE `m`.`activa` = 1 ;

-- --------------------------------------------------------

--
-- Estructura para la vista `vista_resumen_inicio`
--
DROP TABLE IF EXISTS `vista_resumen_inicio`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vista_resumen_inicio`  AS SELECT `u`.`id` AS `usuario_id`, (select count(0) from `mascotas` `m` where `m`.`usuario_id` = `u`.`id` and `m`.`activa` = 1) AS `mascotas_registradas`, (select count(0) from `vista_carnet_vacunas` `c` where `c`.`usuario_id` = `u`.`id` and `c`.`estado` = 'proxima') AS `vacunas_proximas`, (select count(0) from (`citas` `ci` join `mascotas` `m2` on(`m2`.`id` = `ci`.`mascota_id`)) where `m2`.`usuario_id` = `u`.`id` and `ci`.`estado` in ('pendiente','confirmada') and `ci`.`fecha_cita` >= curdate()) AS `proximas_citas`, (select count(0) from (`recordatorios` `r` join `mascotas` `m3` on(`m3`.`id` = `r`.`mascota_id`)) where `m3`.`usuario_id` = `u`.`id` and `r`.`completado_en` is null) AS `recordatorios_pendientes` FROM `usuarios` AS `u` WHERE `u`.`rol` = 'usuario' ;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `chat_conversaciones`
--
ALTER TABLE `chat_conversaciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_chat_conv_usuario` (`usuario_id`,`actualizada_en`),
  ADD KEY `fk_chat_conv_mascota` (`mascota_id`);

--
-- Indices de la tabla `chat_mensajes`
--
ALTER TABLE `chat_mensajes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_chat_msg_conversacion` (`conversacion_id`,`creado_en`);

--
-- Indices de la tabla `citas`
--
ALTER TABLE `citas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_citas_mascota_horario` (`mascota_id`,`fecha_cita`,`hora_cita`,`horario_ocupado`),
  ADD KEY `idx_citas_mascota` (`mascota_id`,`fecha_cita`),
  ADD KEY `idx_citas_disponibilidad` (`veterinaria_id`,`fecha_cita`,`hora_cita`),
  ADD KEY `idx_citas_fecha_estado` (`fecha_cita`,`estado`),
  ADD KEY `fk_citas_motivo` (`motivo_id`),
  ADD KEY `fk_citas_creador` (`creado_por_id`);

--
-- Indices de la tabla `identidades_externas`
--
ALTER TABLE `identidades_externas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_identidad_proveedor` (`proveedor`,`id_externo`),
  ADD UNIQUE KEY `uq_identidad_usuario` (`usuario_id`,`proveedor`);

--
-- Indices de la tabla `mascotas`
--
ALTER TABLE `mascotas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mascotas_usuario` (`usuario_id`,`activa`),
  ADD KEY `idx_mascotas_especie` (`usuario_id`,`especie`);

--
-- Indices de la tabla `mascota_pesos`
--
ALTER TABLE `mascota_pesos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pesos_mascota` (`mascota_id`,`fecha_registro`);

--
-- Indices de la tabla `motivos_consulta`
--
ALTER TABLE `motivos_consulta`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_motivos_nombre` (`nombre`);

--
-- Indices de la tabla `notificaciones`
--
ALTER TABLE `notificaciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notificaciones_usuario` (`usuario_id`,`leida_en`,`creada_en`),
  ADD KEY `fk_notif_mascota` (`mascota_id`),
  ADD KEY `fk_notif_cita` (`cita_id`),
  ADD KEY `fk_notif_vacuna` (`vacuna_aplicada_id`);

--
-- Indices de la tabla `preferencias_usuario`
--
ALTER TABLE `preferencias_usuario`
  ADD PRIMARY KEY (`usuario_id`);

--
-- Indices de la tabla `recordatorios`
--
ALTER TABLE `recordatorios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_recordatorios_mascota` (`mascota_id`,`completado_en`,`fecha_recordatorio`),
  ADD KEY `fk_recordatorios_creador` (`creado_por_id`);

--
-- Indices de la tabla `tokens_usuario`
--
ALTER TABLE `tokens_usuario`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tokens_hash` (`token_hash`),
  ADD KEY `idx_tokens_usuario` (`usuario_id`,`tipo`,`expira_en`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_usuarios_correo` (`correo`),
  ADD KEY `idx_usuarios_rol` (`rol`,`activo`);

--
-- Indices de la tabla `vacunas`
--
ALTER TABLE `vacunas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_vacunas_nombre_especie` (`nombre`,`especie`);

--
-- Indices de la tabla `vacunas_aplicadas`
--
ALTER TABLE `vacunas_aplicadas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_vacunas_mascota` (`mascota_id`,`vacuna_id`,`fecha_aplicacion`),
  ADD KEY `idx_vacunas_proxima` (`proxima_dosis`),
  ADD KEY `fk_vacap_vacuna` (`vacuna_id`),
  ADD KEY `fk_vacap_cita` (`cita_id`),
  ADD KEY `fk_vacap_veterinaria` (`veterinaria_id`),
  ADD KEY `fk_vacap_registrador` (`registrado_por_id`);

--
-- Indices de la tabla `veterinarias`
--
ALTER TABLE `veterinarias`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_veterinarias_filtros` (`activa`,`atiende_24h`,`calificacion_promedio`);

--
-- Indices de la tabla `veterinaria_etiquetas`
--
ALTER TABLE `veterinaria_etiquetas`
  ADD PRIMARY KEY (`veterinaria_id`,`etiqueta`);

--
-- Indices de la tabla `veterinaria_horarios`
--
ALTER TABLE `veterinaria_horarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_horario_tramo` (`veterinaria_id`,`dia_semana`,`hora_apertura`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `chat_conversaciones`
--
ALTER TABLE `chat_conversaciones`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `chat_mensajes`
--
ALTER TABLE `chat_mensajes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `citas`
--
ALTER TABLE `citas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `identidades_externas`
--
ALTER TABLE `identidades_externas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `mascotas`
--
ALTER TABLE `mascotas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `mascota_pesos`
--
ALTER TABLE `mascota_pesos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `motivos_consulta`
--
ALTER TABLE `motivos_consulta`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `notificaciones`
--
ALTER TABLE `notificaciones`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `recordatorios`
--
ALTER TABLE `recordatorios`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `tokens_usuario`
--
ALTER TABLE `tokens_usuario`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `vacunas`
--
ALTER TABLE `vacunas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `vacunas_aplicadas`
--
ALTER TABLE `vacunas_aplicadas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `veterinarias`
--
ALTER TABLE `veterinarias`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `veterinaria_horarios`
--
ALTER TABLE `veterinaria_horarios`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `chat_conversaciones`
--
ALTER TABLE `chat_conversaciones`
  ADD CONSTRAINT `fk_chat_conv_mascota` FOREIGN KEY (`mascota_id`) REFERENCES `mascotas` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_chat_conv_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `chat_mensajes`
--
ALTER TABLE `chat_mensajes`
  ADD CONSTRAINT `fk_chat_msg_conversacion` FOREIGN KEY (`conversacion_id`) REFERENCES `chat_conversaciones` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `citas`
--
ALTER TABLE `citas`
  ADD CONSTRAINT `fk_citas_creador` FOREIGN KEY (`creado_por_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `fk_citas_mascota` FOREIGN KEY (`mascota_id`) REFERENCES `mascotas` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_citas_motivo` FOREIGN KEY (`motivo_id`) REFERENCES `motivos_consulta` (`id`),
  ADD CONSTRAINT `fk_citas_veterinaria` FOREIGN KEY (`veterinaria_id`) REFERENCES `veterinarias` (`id`);

--
-- Filtros para la tabla `identidades_externas`
--
ALTER TABLE `identidades_externas`
  ADD CONSTRAINT `fk_identidades_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `mascotas`
--
ALTER TABLE `mascotas`
  ADD CONSTRAINT `fk_mascotas_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `mascota_pesos`
--
ALTER TABLE `mascota_pesos`
  ADD CONSTRAINT `fk_pesos_mascota` FOREIGN KEY (`mascota_id`) REFERENCES `mascotas` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `notificaciones`
--
ALTER TABLE `notificaciones`
  ADD CONSTRAINT `fk_notif_cita` FOREIGN KEY (`cita_id`) REFERENCES `citas` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_notif_mascota` FOREIGN KEY (`mascota_id`) REFERENCES `mascotas` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_notif_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_notif_vacuna` FOREIGN KEY (`vacuna_aplicada_id`) REFERENCES `vacunas_aplicadas` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `preferencias_usuario`
--
ALTER TABLE `preferencias_usuario`
  ADD CONSTRAINT `fk_preferencias_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `recordatorios`
--
ALTER TABLE `recordatorios`
  ADD CONSTRAINT `fk_recordatorios_creador` FOREIGN KEY (`creado_por_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `fk_recordatorios_mascota` FOREIGN KEY (`mascota_id`) REFERENCES `mascotas` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `tokens_usuario`
--
ALTER TABLE `tokens_usuario`
  ADD CONSTRAINT `fk_tokens_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `vacunas_aplicadas`
--
ALTER TABLE `vacunas_aplicadas`
  ADD CONSTRAINT `fk_vacap_cita` FOREIGN KEY (`cita_id`) REFERENCES `citas` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vacap_mascota` FOREIGN KEY (`mascota_id`) REFERENCES `mascotas` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_vacap_registrador` FOREIGN KEY (`registrado_por_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `fk_vacap_vacuna` FOREIGN KEY (`vacuna_id`) REFERENCES `vacunas` (`id`),
  ADD CONSTRAINT `fk_vacap_veterinaria` FOREIGN KEY (`veterinaria_id`) REFERENCES `veterinarias` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `veterinaria_etiquetas`
--
ALTER TABLE `veterinaria_etiquetas`
  ADD CONSTRAINT `fk_etiquetas_veterinaria` FOREIGN KEY (`veterinaria_id`) REFERENCES `veterinarias` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `veterinaria_horarios`
--
ALTER TABLE `veterinaria_horarios`
  ADD CONSTRAINT `fk_horarios_veterinaria` FOREIGN KEY (`veterinaria_id`) REFERENCES `veterinarias` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
