exports.config = ({
	"redis": {
		"type": "redis",
		"redis": "redis",
		"port": 6379,
		"host": "127.0.0.1",
		"db": 12,
		"options": {
			"parser": "hiredis",
			"detect_buffers": true
		}
	},
	"mqtt": {
		"type": "mqtt",
		"mqtt": "mqtt",
		"url": "mqtt://127.0.0.1:1883",
		"json": false
	}
});