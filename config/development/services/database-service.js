exports.config = ({
	"pool": {
		"max": 4,
		"min": 1
	},
	"debug": true,
	"client": "pg",
	"connection": {
		"host": "127.0.0.1",
		"port": "5432",
		"user": "postgres",
		"database": "twyr",
		"password": "postgres"
	}
});