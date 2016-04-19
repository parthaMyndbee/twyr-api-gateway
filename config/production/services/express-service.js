exports.config = ({
	'protocol': 'http',
	'port': 8080,

	'poweredBy': 'Twyr Portal',

	'cookieParser': {
		'path': '/',
		'domain': '.twyrframework.com',
		'secure': true,
		'httpOnly': false
	},

	'session': {
		'key': 'twyr-portal',
		'secret': 'Th1s!sTheTwyrP0rta1Framew0rk',
		'ttl': 86400,
		'store': {
			'media': 'redis',
			'prefix': 'twyr!portal!session!'
		}
	},

	'ssl': {
		'key': './ssl/portal.key',
		'cert': './ssl/portal.crt',
		'rejectUnauthorized': false
	},

	'templateEngine': 'ejs',

	'maxRequestSize': 1e6,
	'requestTimeout': 25,
	'connectionTimeout': 30,
});