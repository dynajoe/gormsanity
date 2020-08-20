package trace

import (
	"fmt"

	"github.com/jinzhu/gorm"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"

	"github.com/joeandaverde/gormsanity/internal/models"
)

var DBName = "learn_db_example"
var MaxOpenConns = 5

type AccountTestSuite struct {
	suite.Suite

	db *gorm.DB
	a  *require.Assertions
}

func prepareDatabase() (*gorm.DB, error) {
	// Connect to default database
	db, err := gorm.Open("postgres", fmt.Sprintf("host=127.0.0.1 port=5432 sslmode=disable user=%s password=%s", "postgres", "postgres"))
	if err != nil {
		return nil, err
	}
	db.Exec(fmt.Sprintf("DROP DATABASE IF EXISTS %s", DBName))
	db.Exec(fmt.Sprintf("CREATE DATABASE %s", DBName))
	_ = db.Close()

	// Now connect to the test database
	db, err = gorm.Open("postgres", fmt.Sprintf("host=127.0.0.1 port=5432 sslmode=disable user=%s password=%s dbname=%s", "postgres", "postgres", DBName))
	if err != nil {
		return nil, err
	}

	// Set max open connections to a known value
	db.DB().SetMaxOpenConns(MaxOpenConns)

	// Print out queries by GORM
	// Note what GORM prints is an APPROXIMATION
	// of what's executed against the database.
	db = db.Debug()

	// Create our test schema
	db.Exec(`
		CREATE TABLE accounts (
			id serial PRIMARY KEY,
			email_address text,	
			nick_name text,
			status text NOT NULL,
			organization_id text,
			UNIQUE(email_address)
		)
	`)

	return db, nil
}

func (s *AccountTestSuite) SetupTest() {
	db, err := prepareDatabase()
	if err != nil {
		s.T().Error(err)
	}
	s.db = db
	s.a = require.New(s.T())
}

func DeleteAllAccounts(db *gorm.DB, assert *require.Assertions) {
	err := db.Exec("TRUNCATE TABLE accounts").Error
	assert.NoError(err)
}

func GetAccountsCount(db *gorm.DB, assert *require.Assertions) int {
	var totalRecords int
	err := db.Model(models.Account{}).Count(&totalRecords).Error
	assert.NoError(err)
	return totalRecords
}

func CreateAccountsFromEmails(db *gorm.DB, assert *require.Assertions, emailAddresses ...string) []*models.Account {
	var accounts []*models.Account
	for _, a := range emailAddresses {
		accounts = append(accounts, &models.Account{
			EmailAddress: a,
		})
	}

	CreateAccounts(db, assert, accounts...)
	return accounts
}

func CreateAccounts(db *gorm.DB, assert *require.Assertions, accounts ...*models.Account) {
	tx := db.Begin()
	defer tx.RollbackUnlessCommitted()
	for _, a := range accounts {
		if a.Status == "" {
			a.Status = models.Status_Active
		}
		if a.OrganizationID == "" {
			a.OrganizationID = "test"
		}
		assert.NoError(tx.Create(a).Error)
	}
	tx.Commit()
}