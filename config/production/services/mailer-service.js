/*
 * Name			: config/development/services/mailer-service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.6.1
 * Copyright	: Copyright (c) 2014 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MIT License (http://opensource.org/licenses/MIT).
 * Description	: The Twy'r Notification Server Mailer Service Config
 *
 */

"use strict";

exports.config = ({
	'host': 'smtp.gmail.com',
	'port': 465,
	'secure': true,
	'auth': {
		'user': 'user@gmail.com',
		'pass': 'password'
   }
});
