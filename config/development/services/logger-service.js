exports.config = ({
	"File": {
		"json": true,
		"level": "silly",
		"maxsize": 10485760,
		"colorize": true,
		"filename": "logs/twyr-api-gateway.log",
		"maxFiles": 15,
		"tailable": true,
		"timestamp": true,
		"prettyPrint": true,
		"zippedArchive": true,
		"handleExceptions": true,
		"humanReadableUnhandledException": true
	},
	"Console": {
		"json": false,
		"level": "debug",
		"colorize": true,
		"timestamp": true,
		"prettyPrint": true,
		"handleExceptions": true,
		"humanReadableUnhandledException": true
	}
});