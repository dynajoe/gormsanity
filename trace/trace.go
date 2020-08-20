package trace

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"sync"
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
	StartTime    time.Time              `json:"start_time"`
	Query        string                 `json:"query"`
	EndTime      time.Time              `json:"end_time"`
	EventType    string                 `json:"event_type"`
	RowsAffected int64                  `json:"rows_affected"`
	Errors       []error                `json:"errors"`
	InstanceID   string                 `json:"db_instance_id"`
	IsComplete   bool                   `json:"completed"`
	Vars         map[string]interface{} `json:"settings"`
}

type tracer struct {
	ID     string
	Events map[string]*GormEvent
	mu     *sync.Mutex
}

func TraceDB(db *gorm.DB) (*gorm.DB, func()) {
	t := tracer{
		Events: make(map[string]*GormEvent),
		mu:     &sync.Mutex{},
	}

	// Create
	createCallback := db.Callback().Create()
	createCallback.After("gorm:begin_transaction").Register(trackScopeKey, t.EventGenerator("create"))
	createCallback.After("gorm:commit_or_rollback_transaction").Register(trackScopeKey+":complete", t.CompleteEvent)

	// RowQuery
	rowQueryCallback := db.Callback().RowQuery()
	rowQueryCallback.Before("gorm:row_query").Register(trackScopeKey, t.EventGenerator("row_query"))
	rowQueryCallback.After("gorm:row_query").Register(trackScopeKey+":complete", t.CompleteEvent)

	// Query
	queryCallback := db.Callback().Query()
	queryCallback.Before("gorm:query").Register(trackScopeKey, t.EventGenerator("query"))
	queryCallback.After("gorm:after_query").Register(trackScopeKey+":complete", t.CompleteEvent)

	// Update
	updateCallback := db.Callback().Update()
	updateCallback.After("gorm:begin_transaction").Register(trackScopeKey, t.EventGenerator("update"))
	updateCallback.After("gorm:commit_or_rollback_transaction").Register(trackScopeKey+":complete", t.CompleteEvent)

	// Delete
	deleteCallback := db.Callback().Delete()
	deleteCallback.After("gorm:begin_transaction").Register(trackScopeKey, t.EventGenerator("delete"))
	deleteCallback.After("gorm:commit_or_rollback_transaction").Register(trackScopeKey+":complete", t.CompleteEvent)

	return db, func() {
		t.Close()
	}
}

func (t *tracer) EventGenerator(eventType string) func(scope *gorm.Scope) {
	return func(scope *gorm.Scope) {
		t.AddEvent(eventType, scope)
	}
}

func (t *tracer) AddEvent(eventType string, scope *gorm.Scope) {
	key := uuid.New().String()
	scope.Set(trackScopeKey, key)
	e := &GormEvent{
		StartTime:  time.Now(),
		EventType:  eventType,
		InstanceID: scope.InstanceID(),
	}
	extractFromScope(e, scope)

	t.mu.Lock()
	defer t.mu.Unlock()
	t.Events[key] = e
}

func (t *tracer) CompleteEvent(scope *gorm.Scope) {
	key, ok := scope.Get(trackScopeKey)
	if !ok {
		return
	}

	entry := t.Events[key.(string)]
	entry.EndTime = time.Now()
	entry.IsComplete = true
	extractFromScope(entry, scope)
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

func (t *tracer) Close() {
	for _, e := range t.Events {
		if !e.IsComplete {
			e.EndTime = time.Now()
			writeEntry(e)
		}
	}
}
