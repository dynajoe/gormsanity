package trace

import (
	"strings"

	"github.com/jinzhu/gorm"

	"github.com/joeandaverde/gormsanity/internal/models"
)

var testAccounts = []*models.Account{
	{
		EmailAddress:   "learn1@acme.com",
		Status:         models.Status_Active,
		NickName:       "learn",
		OrganizationID: "acme",
	},
	{
		EmailAddress:   "learn2@acme.com",
		Status:         models.Status_Active,
		NickName:       "learn",
		OrganizationID: "acme",
	},
	{
		EmailAddress:   "learn3@acme.com",
		Status:         models.Status_Disabled,
		NickName:       "learn",
		OrganizationID: "acme",
	},
	{
		EmailAddress:   "learn4@acme.com",
		Status:         models.Status_Disabled,
		OrganizationID: "acme",
	},
	{
		EmailAddress:   "learn5@acme.com",
		Status:         models.Status_Disabled,
		OrganizationID: "acme",
	},
}

func (s *AccountTestSuite) TestQuery_Gotcha_FewerFiltersThanExpected() {
	DeleteAllAccounts(s.db, s.a)
	CreateAccounts(s.db, s.a, testAccounts...)

	// Add this callback on query so we can inspect the executed SQL
	var lastSQL string
	s.db.Callback().Query().Register("spy", func(scope *gorm.Scope) {
		lastSQL = strings.TrimSpace(scope.SQL)
	})

	var accounts []*models.Account

	// We expect no accounts to match the non-existent org id.
	s.db.Where(models.Account{
		Status:         "",
		OrganizationID: "non-existent",
	}).Find(&accounts)
	s.a.Len(accounts, 0)
	s.a.Equal(`SELECT * FROM "accounts"  WHERE ("accounts"."organization_id" = $1)`, lastSQL)

	// A excluding a field doesn't include it in the filter!
	s.db.Where(models.Account{}).Find(&accounts)
	s.a.Len(accounts, len(testAccounts))
	s.a.Equal(`SELECT * FROM "accounts"`, lastSQL)

	// This is equivalent to above
	s.db.Where(models.Account{
		Status:         "",
		OrganizationID: "",
	}).Find(&accounts)
	s.a.Len(accounts, len(testAccounts))
	s.a.Equal(`SELECT * FROM "accounts"`, lastSQL)

	// Lesson: GORM will not add WHERE filters for zero values using the
	// db.Where(modelQuery) method
}