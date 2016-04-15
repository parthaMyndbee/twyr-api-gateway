/*
 * Name			: app/modules/utilities/rest-call/utility.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Utility Method to invoke a RESTful API on another server
 *
 */


"use strict";

/**
 * Module dependencies.
 */

exports.utility = {
	'name' : 'restCall',
	'method' : function(proto, options, callback) {
		var protocol = require(proto),
			statusCodes = require('http').STATUS_CODES;

		// See if the options are ok, otherwise add what we need
		if (options.method === 'POST') {
			if (!options.headers)
				options.headers = {};
			if (!options.headers['Content-Type'])
				options.headers['Content-Type'] = 'application/json';
			if (!options.headers['Content-Length'])
				options.headers['Content-Length'] = Buffer.byteLength(options.data);
		}

		// Here is the meat and potatoes for executing the request
		console.log('restCall::Executing Request: ', options);
		var request = protocol.request(options, function(response) {
			var data = null;

			response.setEncoding('utf8');
			response.on('data', function(chunk) {
				if (!data)
					data = chunk;
				else
					data += chunk;
			});

			response.on('end', function() {
				console.log(data);
				var errorObj = null;

				if(response.statusCode != '200') {
					errorObj = {
						'code': response.statusCode,
						'path': options.path,
						'message': statusCodes[response.statusCode]
					}

					console.error('restCall::StatusCodeError:\nURL: ', options.path, '\nError:', errorObj);
				}

				if (callback) callback(errorObj, data);
			});
		});

		request.on('error', function(err) {
			console.error('restCall::RequestError:\nURL: ', options.path, '\nError:', err);
			if (callback) callback(err, null);
		});

		// Now that the infrastructure is setup, write the data
		if (options.method === 'POST') {
			request.write(options.data);
		}

		// Tell node we are done, so it actually executes
		request.end();
	}
};
