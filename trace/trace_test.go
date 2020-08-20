package trace

import (
	"fmt"
	"testing"

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

	db           *gorm.DB
	a            *require.Assertions
	tracer       *Tracer
	tracerCloser func()
}

func prepareDatabase(testT *testing.T) (*gorm.DB, *Tracer, func(), error) {
	// Connect to default database
	db, err := gorm.Open("postgres", fmt.Sprintf("host=127.0.0.1 port=5432 sslmode=disable user=%s password=%s", "postgres", "postgres"))
	if err != nil {
		return nil, nil, nil, err
	}
	db.Exec(fmt.Sprintf("DROP DATABASE IF EXISTS %s", DBName))
	db.Exec(fmt.Sprintf("CREATE DATABASE %s", DBName))
	_ = db.Close()

	// Now connect to the test database
	db, err = gorm.Open("postgres", fmt.Sprintf("host=127.0.0.1 port=5432 sslmode=disable user=%s password=%s dbname=%s", "postgres", "postgres", DBName))
	if err != nil {
		return nil, nil, nil, err
	}

	// Set max open connections to a known value
	db.DB().SetMaxOpenConns(MaxOpenConns)

	// Print out queries by GORM
	// Note what GORM prints is an APPROXIMATION
	// of what's executed against the database.
	db = db.Debug()

	// Add the GORMSanity Tracer
	db, tracer, closer := TraceDB(db, testT)
	tracer.dontFail = true

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

	return db, tracer, closer, nil
}

func (s *AccountTestSuite) SetupTest() {
	var err error
	s.db, s.tracer, s.tracerCloser, err = prepareDatabase(s.T())
	if err != nil {
		s.T().Error(err)
	}
	s.a = require.New(s.T())
}

func TestAccountTestSuite(t *testing.T) {
	suite.Run(t, new(AccountTestSuite))
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

func TestFoo(t *testing.T) {

}

func (s *AccountTestSuite) TestDeleteModel() {
	DeleteAllAccounts(s.db, s.a)
	CreateAccounts(s.db, s.a, testAccounts[:2]...)

	deleteM := &models.Account{
		Id:           testAccounts[0].Id,
		EmailAddress: testAccounts[0].EmailAddress,
	}
	s.db.Delete(deleteM)
	s.a.Equal(1, len(s.tracer.Errors))
}

func (s *AccountTestSuite) TestCreateWithModel() {
	DeleteAllAccounts(s.db, s.a)
	CreateAccounts(s.db, s.a, testAccounts[0])
	s.a.Equal(0, len(s.tracer.Errors))
}
