/*
 * Name			: index.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: Entry point into the Twy'r API Gateway Framework
 *
 */

"use strict";

/**
 * Module dependencies.
 */
var promises = require('bluebird'),
	domain = require('domain'),
	path = require('path'),
	printf = require('node-print'),
	repl = require('repl'),
	uuid = require('node-uuid');

// Get what we need - environment, and the configuration specific to that environment
var env = (process.env.NODE_ENV || 'development').toLowerCase(),
	config = require(path.join(__dirname, 'config', env, 'index-config')).config,
	numForks = Math.floor(require('os').cpus().length * config['loadFactor']);

var timeoutMonitor = {},
	clusterId = uuid.v4().toString().replace(/-/g, ''),
	cluster = promises.promisifyAll(require('cluster'));

// One log to rule them all, one log to find them...
var onlineCount = 0,
	port = 0;

process.title = config['title'].substring(0, 11);

// Instantiate the application, and start the execution
if (cluster.isMaster) {
	var printNetworkInterfaceList = function() {
		onlineCount++;
		if(onlineCount < numForks)
			return;

		var networkInterfaces = require('os').networkInterfaces(),
			forPrint = [];

		for(var intIdx in networkInterfaces) {
			var thisNetworkInterface = networkInterfaces[intIdx];
			for(var addIdx in thisNetworkInterface) {
				var thisAddress = thisNetworkInterface[addIdx];
				forPrint.push({
					'Interface': intIdx,
					'Protocol': thisAddress.family,
					'Address': thisAddress.address,
					'Port': port ? port : 'NOT LISTENING'
				});
			}
		}

		console.log('\n\n' + process.title + ' Listening On:');
		if (forPrint.length) printf.printTable(forPrint);
		console.log('\n\n');
	};

	cluster
	.on('fork', function(worker) {
		console.log('\nForked Twyr API Gateway #' + worker.id);
		timeoutMonitor[worker.id] = setTimeout(function() {
			console.error('Twyr API Gateway #' + worker.id + ' did not start in time! KILL!!');
			worker.kill();
		}, 300000);
	})
	.on('online', function(worker, address) {
		console.log('Twyr API Gateway #' + worker.id + ': Now online!\n');
		clearTimeout(timeoutMonitor[worker.id]);
	})
	.on('listening', function(worker, address) {
		console.log('Twyr API Gateway #' + worker.id + ': Now listening\n');

		port = address.port;
		clearTimeout(timeoutMonitor[worker.id]);
		if(onlineCount >= numForks) printNetworkInterfaceList();
	})
	.on('disconnect', function(worker) {
		console.log('Twyr API Gateway #' + worker.id + ': Disconnected');
		timeoutMonitor[worker.id] = setTimeout(function() {
			worker.kill();
		}, 2000);

		timeoutMonitor[worker.id].unref();
		if (cluster.isMaster && config['restart']) cluster.fork();
	})
	.on('exit', function(worker, code, signal) {
		console.log('Twyr API Gateway #' + worker.id + ': Exited with code: ' + code + ' on signal: ' + signal);
		clearTimeout(timeoutMonitor[worker.id]);
	})
	.on('death', function(worker) {
		console.error('Twyr API Gateway #' + worker.pid + ': Death!');
		clearTimeout(timeoutMonitor[worker.id]);
	});

	// Setup listener for online counts
	cluster.on('message', function(worker, msg) {
		if (arguments.length === 2) {
			handle = message;
			message = worker;
			worker = undefined;
		}

		if(msg != 'worker-online')
			return;

		printNetworkInterfaceList();
	});

	// Fork workers.
	for (var i = 0; i < numForks; i++) {
		cluster.fork();
	}

	// In development mode (i.e., start as "npm start"), wait for input from command line
	// In other environments, start a telnet server and listen for the exit command
	if(env == 'development') {
		var replConsole = repl.start(config.repl);
		replConsole.on('exit', function() {
			console.log('Twyr API Gateway Master: Stopping now...');
			config['restart'] = false;

			for(var id in cluster.workers) {
				(cluster.workers[id]).send('terminate');
			}
		});
	}
	else {
		var telnetServer = require('net').createServer(function(socket) {
			config.repl.parameters.input = socket;
			config.repl.parameters.output = socket;

			var replConsole = repl.start(config.repl.parameters);
			replConsole.context.socket = socket;

			replConsole.on('exit', function() {
				console.log('Twyr API Gateway Master: Stopping now...');
				config['restart'] = false;

				for(var id in cluster.workers) {
					(cluster.workers[id]).send('terminate');
				}

				socket.end();
				telnetServer.close();
			});
		});

		telnetServer.listen(config.repl.controlPort, config.repl.controlHost);
	}
}
else {
	// Worker processes have a Twyr API Gateway running in their own
	// domain so that the rest of the process is not infected on error
	var serverDomain = domain.create(),
		TwyrAPIGateway = require(config['main']).twyrAPIGateway,
		twyrAPIGateway = promises.promisifyAll(new TwyrAPIGateway(config['application'], clusterId, cluster.worker.id));

	var startupFn = function () {
		var allStatuses = [];
		if(!twyrAPIGateway) return;

		// Call load / initialize / start...
		twyrAPIGateway.loadAsync(null)
		.timeout(180000)
		.then(function(status) {
			allStatuses.push('Twyr API Gateway #' + cluster.worker.id + '::Load status:\n' + JSON.stringify(status, null, '\t') + '\n\n');
			if(!status) throw status;

			return twyrAPIGateway.initializeAsync();
		})
		.timeout(180000)
		.then(function(status) {
			allStatuses.push('Twyr API Gateway #' + cluster.worker.id + '::Initialize status:\n' + JSON.stringify(status, null, '\t') + '\n\n');
			if(!status) throw status;

			return twyrAPIGateway.startAsync(null);
		})
		.timeout(180000)
		.then(function(status) {
			allStatuses.push('Twyr API Gateway #' + cluster.worker.id + '::Start Status:\n' + JSON.stringify(status, null, '\t') + '\n\n');
			if(!status) throw status;

			return null;
		})
		.timeout(180000)
		.catch(function(err) {
			console.error('\n\n' + 'Twyr API Gateway #' + cluster.worker.id + '::Startup Error:\n', JSON.stringify(err, null, '\t'), '\n\n');
	        cluster.worker.disconnect();
		})
		.finally(function () {
			console.log(allStatuses.join('\n'));
			process.send('worker-online');
			return null;
		});
	};

	var shutdownFn = function () {
		var allStatuses = [];
		if(!twyrAPIGateway) return;

		twyrAPIGateway.stopAsync()
		.timeout(180000)
		.then(function (status) {
			allStatuses.push('Twyr API Gateway #' + cluster.worker.id + '::Stop Status:\n' + JSON.stringify(status, null, '\t') + '\n\n');
			if (!status) throw status;

			return twyrAPIGateway.uninitializeAsync();
		})
		.timeout(180000)
		.then(function (status) {
			allStatuses.push('Twyr API Gateway #' + cluster.worker.id + '::Uninitialize Status:\n' + JSON.stringify(status, null, '\t') + '\n\n');
			if (!status) throw status;

			return twyrAPIGateway.unloadAsync();
		})
		.timeout(180000)
		.then(function (status) {
			allStatuses.push('Twyr API Gateway #' + cluster.worker.id + '::Unload Status:\n' + JSON.stringify(status, null, '\t') + '\n\n');
			if (!status) throw status;

			return null;
		})
		.timeout(180000)
		.then(function() {
	        cluster.worker.disconnect();
			return null;
		})
		.catch(function (err) {
			console.error('\n\n' + 'Twyr API Gateway #' + cluster.worker.id + '::Shutdown Error:\n', JSON.stringify(err, null, '\t'), '\n\n');
		})
		.finally(function () {
			console.log(allStatuses.join('\n'));
			return null;
		});
	};

	process.on('message', function(msg) {
		if(msg != 'terminate') return;
		shutdownFn();
	});

	serverDomain.on('error', function(err) {
		console.error('Twyr API Gateway #' + cluster.worker.id + '::Domain Error:\n', err);
		shutdownFn();
	});

	process.on('uncaughtException', function(err) {
		console.error('Twyr API Gateway #' + cluster.worker.id + '::Process Error: ', err);
		shutdownFn();
	});

	serverDomain.run(startupFn);
}
