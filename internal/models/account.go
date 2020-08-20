package models

type Status string

const (
	Status_Active   = "active"
	Status_Disabled = "disabled"
)

type Account struct {
	Id             int `gorm:"primary_key"`
	EmailAddress   string
	Status         Status
	NickName       string
	OrganizationID string
}

// TableName instructs GORM on the table name to use
func (Account) TableName() string {
	return "accounts"
}

// Ensure that Account meets the interface to set the table name for
// the model. Unfortunately the interface is not exposed by GORM.
var _ interface {
	TableName() string
} = Account{}