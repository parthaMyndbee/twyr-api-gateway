exports.config = ({
	"client": "pg",
	"debug": true,
	"connection": {
		"host": "127.0.0.1",
		"port": "5432",
		"user": "postgres",
		"password": "postgres",
		"database": "twyr"
	},
	"pool": {
		"min": 0,
		"max": 6
	}
});