package trace

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jinzhu/gorm"
)

const trackScopeKey = "gorm_tracer"

var writer *bufio.Writer

func getWriter() *bufio.Writer {
	if writer == nil {
		f, err := os.Create(fmt.Sprintf("gorm.%d.log", time.Now().UnixNano()))
		if err != nil {
			return nil
		}
		writer = bufio.NewWriter(f)
	}
	return writer
}

func writeEntry(gormEvent *GormEvent) {
	bs, err := json.Marshal(gormEvent)
	if err != nil {
		return
	}
	w := getWriter()
	w.Write(bs)
	w.WriteByte('\n')
	w.Flush()
}

type GormEvent struct {
	StartTime     time.Time              `json:"start_time"`
	Query         string                 `json:"query"`
	EndTime       time.Time              `json:"end_time"`
	EventType     string                 `json:"event_type"`
	RowsAffected  int64                  `json:"rows_affected"`
	Errors        []error                `json:"errors"`
	InstanceID    string                 `json:"db_instance_id"`
	IsComplete    bool                   `json:"completed"`
	Vars          map[string]interface{} `json:"settings"`
	InitialFields []gorm.Field           `json:"-"`
	Warnings      []string               `json:"warnings"`
	TableName     string                 `json:"table_name"`
	SQLVars       []interface{}          `json:"sql_vars"`
}

type Tracer struct {
	ID       string
	Events   map[string]*GormEvent
	Errors   []error
	mu       *sync.Mutex
	dontFail bool
	testT    *testing.T
	db       *gorm.DB
}

func TraceDB(db *gorm.DB, testT *testing.T) (*gorm.DB, *Tracer, func()) {
	t := Tracer{
		Events: make(map[string]*GormEvent),
		mu:     &sync.Mutex{},
		testT:  testT,
		db:     db,
	}

	// Create
	db.Callback().Create().After("gorm:begin_transaction").Register(trackScopeKey, t.CreateEvent) // INSERT
	db.Callback().Create().After("gorm:commit_or_rollback_transaction").Register(trackScopeKey+":complete", t.GenericAfterComplete)

	// RowQuery
	db.Callback().RowQuery().Before("gorm:row_query").Register(trackScopeKey, t.RowQueryEvent)
	db.Callback().RowQuery().After("gorm:row_query").Register(trackScopeKey+":complete", t.GenericAfterComplete)

	// Query
	db.Callback().Query().Before("gorm:query").Register(trackScopeKey, t.QueryEvent) // SELECT
	db.Callback().Query().After("gorm:after_query").Register(trackScopeKey+":complete", t.GenericAfterComplete)

	// Update
	db.Callback().Update().After("gorm:begin_transaction").Register(trackScopeKey, t.UpdateEvent) // UPDATE
	db.Callback().Update().After("gorm:commit_or_rollback_transaction").Register(trackScopeKey+":complete", t.GenericAfterComplete)

	// Delete
	db.Callback().Delete().After("gorm:begin_transaction").Register(trackScopeKey, t.DeleteEvent) // DELETE
	db.Callback().Delete().After("gorm:commit_or_rollback_transaction").Register(trackScopeKey+":complete", t.GenericAfterComplete)

	return db, &t, func() {
		t.Close()
	}
}

func (t *Tracer) GenericAfterComplete(scope *gorm.Scope) {
	// General rules here
	key, _ := scope.Get(trackScopeKey)
	entry := t.Events[key.(string)]
	extractFromScope(entry, scope)
	t.RunGenericRules(entry, scope)
	t.CompleteEvent(scope)
}

	switch entry.EventType {
	case "delete":
		// Run specific rules
	}
}

func (t *Tracer) RunGenericRules(event *GormEvent, scope *gorm.Scope) {
	for _, r := range allGenericRules {
		err := r(event, scope)
		if err != nil {
			if t.dontFail {
				t.Errors = append(t.Errors, err)
			} else {
				t.testT.Error(err)
			}
		}
	}
}

func (t *Tracer) CreateEvent(scope *gorm.Scope) {
	t.AddEvent("create", scope)
}

func (t *Tracer) QueryEvent(scope *gorm.Scope) {
	t.AddEvent("query", scope)
}

func (t *Tracer) RowQueryEvent(scope *gorm.Scope) {
	t.AddEvent("row_query", scope)
}

func (t *Tracer) UpdateEvent(scope *gorm.Scope) {
	t.AddEvent("update", scope)
}

func (t *Tracer) DeleteEvent(scope *gorm.Scope) {
	t.AddEvent("delete", scope)
}

func (t *Tracer) EventGenerator(eventType string) func(scope *gorm.Scope) {
	return func(scope *gorm.Scope) {
		t.AddEvent(eventType, scope)
	}
}

func (t *Tracer) AddEvent(eventType string, scope *gorm.Scope) {
	key := uuid.New().String()
	scope.Set(trackScopeKey, key)
	e := &GormEvent{
		StartTime:  time.Now(),
		EventType:  eventType,
		InstanceID: scope.InstanceID(),
		TableName:  scope.TableName(),
	}
	extractFromScope(e, scope)

	for _, f := range scope.Fields() {
		e.InitialFields = append(e.InitialFields, *f)
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	t.Events[key] = e
}

func (t *Tracer) CompleteEvent(scope *gorm.Scope) {
	// Complete the event
	key, _ := scope.Get(trackScopeKey)
	entry := t.Events[key.(string)]
	if entry.IsComplete {
		return
	}

	entry.EndTime = time.Now()
	entry.IsComplete = true
	writeEntry(entry)
}

var knownAttrs = []string{
	"gorm:insert_option",
	"gorm:query_option",
	"gorm:delete_option",
	"gorm:started_transaction",
	"gorm:table_options",
}

func copyScopeAttrs(scope *gorm.Scope) map[string]interface{} {
	attrs := make(map[string]interface{})
	for _, a := range knownAttrs {
		if v, ok := scope.Get(a); ok {
			attrs[a] = v
		}
	}
	return attrs
}

func extractFromScope(entry *GormEvent, scope *gorm.Scope) {
	entry.Query = scope.SQL
	entry.RowsAffected = scope.DB().RowsAffected
	entry.Errors = scope.DB().GetErrors()
	entry.Vars = copyScopeAttrs(scope)
}

func (t *Tracer) Close() {
	for _, e := range t.Events {
		if !e.IsComplete {
			e.EndTime = time.Now()
			writeEntry(e)
		}
	}
}

func RuleError(msg string, args ...interface{}) error {
	return fmt.Errorf(msg, args...)
}

type RuleFunc func(*GormEvent, *gorm.Scope) error

// RULES

func ValuesDoesntMatchSQLVars(event *GormEvent, scope *gorm.Scope) error {
	notBlankValues := 0
	defaultGORMFields := []string{"created_at", "updated_at"}
	for _, f := range event.InitialFields {
		if !f.IsBlank || stringArrayContains(defaultGORMFields, f.DBName) || f.Struct.Type.Kind() == reflect.Bool {
			notBlankValues++
		}
	}
	if len(scope.SQLVars) != notBlankValues {
		return RuleError("not all values provided into GORM have been used for the final SQL query: (%s, %v)", scope.SQL, scope.SQLVars)
	}

	return nil
}

func NoWhereClauseInSelect(event *GormEvent, scope *gorm.Scope) error {
	if event.EventType == "query" && len(scope.SQLVars) == 0 {
		event.Warnings = append(event.Warnings, "no_where_clause")
		return RuleError("no where clause in select")
	}
	return nil
}

func InsertWithBlanks(event *GormEvent, scope *gorm.Scope) error {
	if event.EventType == "create" {
		blankValue := false
		for _, v := range scope.SQLVars {
			if v == reflect.Zero(reflect.TypeOf(v)).Interface() {
				blankValue = true
			}
		}

		if blankValue {
			event.Warnings = append(event.Warnings, "zero_insert_value")
			event.SQLVars = scope.SQLVars
			return RuleError("using a zero value in INSERT query")
		}
	}

	return nil
}

func stringArrayContains(arr []string, s string) bool {
	for _, x := range arr {
		if s == x {
			return true
		}
	}
	return false
}

var allGenericRules = []RuleFunc{
	ValuesDoesntMatchSQLVars,
	NoWhereClauseInSelect,
	InsertWithBlanks,
}
