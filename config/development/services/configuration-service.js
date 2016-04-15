exports.config = ({
	"services": {
		"path": "./services"
	},
	"priorities": {
		"file-configuration-service": 10,
		"database-configuration-service": 20
	},
	"subservices": {
		"database": {
			"client": "pg",
			"debug": false,
			"connection": {
				"host": "127.0.0.1",
				"port": "5432",
				"user": "postgres",
				"password": "postgres",
				"database": "twyr"
			},
			"pool": {
				"min": 2,
				"max": 4
			},
			"migrations": {
				"directory": "knex_migrations/migrations",
				"tableName": "knex_migrations"
			},
			"seeds": {
				"directory": "knex_migrations/seeds",
				"tableName": "knex_seeds"
			}
		}
	}
});

