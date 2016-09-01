exports.config = ({
	"ssl": {
		"key": "./ssl/portal.key",
		"cert": "./ssl/portal.crt",
		"rejectUnauthorized": false
	},
	"port": {
		"twyr-portal": 9100,
		"twyr-api-gateway": 9090
	},
	"favicon": "./favicon.ico",
	"session": {
		"key": "twyr-webapp",
		"ttl": 86400,
		"store": {
			"media": "redis",
			"prefix": "twyr!webapp!session!"
		},
		"secret": "Th1s!sTheTwyrP0rta1Framew0rk"
	},
	"protocol": "http",
	"poweredBy": "Twy'r Web App",
	"cookieParser": {
		"path": "/",
		"domain": ".twyrframework.com",
		"secure": false,
		"httpOnly": false
	},
	"maxRequestSize": 5242880,
	"requestTimeout": 25,
	"templateEngine": "ejs",
	"connectionTimeout": 30,
	"corsAllowedDomains": [
		"http://local-portal.twyrframework.com:9100",
		"http://local-api.twyrframework.com:9090"
	]
});