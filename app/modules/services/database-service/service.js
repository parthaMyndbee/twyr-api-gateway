/*
 * Name			: app/modules/services/database-service/service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Database Service - built on top of Knex / Booksshelf and so supports MySQL, PostgreSQL, and a few others
 *
 */

"use strict";

/**
 * Module dependencies, required for ALL Twy'r modules
 */
var base = require('./../service-base').baseService,
	prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */
var bookshelf = require('bookshelf'),
	knex = require('knex'),
	path = require('path');

var databaseService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);

		this._setupBookshelfAsync = promises.promisify(this._setupBookshelf.bind(this));
		this._teardownBookshelfAsync = promises.promisify(this._teardownBookshelf.bind(this));
	},

	'start': function(dependencies, callback) {
		var self = this;

		self._setupBookshelfAsync()
		.then(function() {
			databaseService.parent.start.call(self, dependencies, callback);
			return null;
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'getInterface': function() {
		return this.$database;
	},

	'stop': function(callback) {
		var self = this;

		// Stop sub-services, if any...
		databaseService.parent.stop.call(self, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._teardownBookshelfAsync()
			.then(function() {
				if(callback) callback(null, status);
				return null;
			})
			.catch(function(teardownErr) {
				if(callback) callback(teardownErr);
			});
		});
	},

	'_reconfigure': function(config) {
		var self = this;

		self._teardownBookshelfAsync()
		.then(function() {
			self['$config'] = config;
			return self._setupBookshelfAsync();
		})
		.catch(function(err) {
			self.dependencies['logger-service'].error(self.name + '::_reconfigure:\n', err);
		});
	},

	'_setupBookshelf': function(callback) {
		try {
			var knexInstance = knex(this.$config);
			knexInstance.on('query', this._databaseQuery.bind(this));
			knexInstance.on('query-error', this._databaseQueryError.bind(this));

			this['$database'] = bookshelf(knexInstance);
			if(callback) callback(null);
		}
		catch(err) {
			console.error(this.name + '::_setupBookshelf error: ', err);
		}
	},

	'_teardownBookshelf': function(callback) {
		var self = this;

		self.$database.knex.destroy()
		.then(function() {
			delete self['$database'];

			if(callback) callback(null);
			return null;
		})
		.catch(function(destroyErr) {
			if(callback) callback(destroyErr);
		});
	},

	'_databaseQuery': function(queryData) {
		this.dependencies['logger-service'].silly(this.name + '::_databaseQuery: ', queryData);
	},

	'_databaseQueryError': function(err, queryData) {
		this.dependencies['logger-service'].error(this.name + '::_databaseQueryError: ', { 'query': queryData, 'error': err });
	},

	'_databaseNotice': function() {
		this.dependencies['logger-service'].info(this.name + '::_databaseNotice: ', arguments);
	},

	'_databaseError': function() {
		this.dependencies['logger-service'].error(this.name + '::_databaseError: ', arguments);
	},

	'name': 'database-service',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'logger-service']
});

exports.service = databaseService;
