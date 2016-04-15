exports.config = ({
	"Console": {
		"level": "error",
		"colorize": true,
		"timestamp": true,
		"json": false,
		"prettyPrint": true,
		"handleExceptions": true,
		"humanReadableUnhandledException": true
	},
	"File": {
		"level": "debug",
		"colorize": true,
		"timestamp": true,
		"json": true,
		"prettyPrint": true,
		"filename": "logs/twyr-api-gateway.log",
		"maxsize": 10485760,
		"maxFiles": 5,
		"tailable": true,
		"zippedArchive": true,
		"handleExceptions": true,
		"humanReadableUnhandledException": true
	}
});