exports.config = ({
	"from": "root@twyr.com",
	"sender": "Administrator, Twy'r Framework",
	"randomServer": {
		"protocol": "https",
		"options": {
			"method": "POST",
			"host": "api.random.org",
			"port": 443,
			"path": "/json-rpc/1/invoke",
			"data": {
				"jsonrpc": "2.0",
				"method": "generateStrings",
				"params": {
					"apiKey": "e20ac8ec-9748-4736-a61c-d234ac6ac619",
					"n": 1,
					"length": 10,
					"characters": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
					"replacement": false
				},
				"id": ""
			}
		}
	},
	"resetPassword": {
		"subject": "Twy'r Portal Reset Password",
		"template": "templates/resetPassword.ejs"
	},
	"newAccount": {
		"subject": "Twy'r Portal Account Registration",
		"template": "templates/newAccount.ejs"
	}
});