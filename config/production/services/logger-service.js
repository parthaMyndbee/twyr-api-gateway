exports.config = ({
	"File": {
		"json": true,
		"level": "debug",
		"maxsize": 10485760,
		"colorize": true,
		"filename": "logs/twyr-webapp.log",
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
		"level": "silly",
		"colorize": true,
		"timestamp": true,
		"prettyPrint": true,
		"handleExceptions": true,
		"humanReadableUnhandledException": true
	}
});