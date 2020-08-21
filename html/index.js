import 'bulma'
import '@fortawesome/fontawesome-free/css/all.css'
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import Highlight from 'react-highlight.js'
import Moment from 'moment'
import SqlFormatter from 'sql-formatter'
import _ from 'lodash'

import './app.scss'

const transactions = {}
let tx_counter = 0
const mapTxId = (tx_id) => {
   if (!_.has(transactions, tx_id)) {
      transactions[tx_id] = ++tx_counter
   }

   return transactions[tx_id]
}

const App = ({ data }) => {
   const [filter, setFilter] = useState('all')

   data = _.map(data, (q) => {
      const durationMs = Moment.duration(
         Moment(q.end_time).diff(Moment(q.start_time))
      ).asMilliseconds()
      return { ...q, duration: durationMs, is_slow: durationMs >= 1000 }
   })

   const all = {
      title: 'All',
      key: 'all',
      category: 'General',
      data: data,
   }

   const slow = {
      title: 'Slow',
      key: 'slow',
      category: 'General',
      data: data.filter((q) => q.is_slow),
   }

   const warnings = {
      title: 'Warn',
      key: 'Warn',
      category: 'General',
      data: data.filter((q) => !_.isEmpty(q.warnings)),
   }

   const no_where_clause = {
      title: 'SELECT without WHERE',
      key: 'no_where_clause',
      category: 'Warnings',
      data: warnings.data.filter((q) => {
         return _.find(q.warnings, (w) => {
            return w === 'no_where_clause'
         })
      }),
   }

   const no_where_delete = {
      title: 'DELETE without WHERE',
      key: 'no_where_delete',
      category: 'Warnings',
      data: warnings.data.filter((q) => {
         return _.find(q.warnings, (w) => {
            return w === 'no_where_delete'
         })
      }),
   }

   const no_where_update = {
      title: 'UPDATE without WHERE',
      key: 'no_where_update',
      category: 'Warnings',
      data: warnings.data.filter((q) => {
         return _.find(q.warnings, (w) => {
            return w === 'no_where_update'
         })
      }),
   }

   const zero_insert_value = {
      title: 'INSERT zero value',
      key: 'zero_insert_value',
      category: 'Warnings',
      data: warnings.data.filter((q) => {
         return _.find(q.warnings, (w) => {
            return w === 'zero_insert_value'
         })
      }),
   }

   const categories = [all, slow, warnings]

   const warn_categories = [
      no_where_clause,
      no_where_delete,
      no_where_update,
      zero_insert_value,
   ]

   const table_categories = _(data)
      .groupBy((d) => d.table_name)
      .map((d, k) => {
         return {
            title: k,
            key: k,
            data: d,
            category: 'Tables',
         }
      })
      .value()

   const all_categories = _.concat(
      categories,
      warn_categories,
      table_categories
   )

   let current_selection = all_categories.find((x) => x.key === filter)

   if (_.isNil(current_selection)) {
      current_selection = all
   }

   return (
      <>
         <h1 className="header title has-text-left">
            G
            <span className="icon has-text-danger">
               <i className="fas fa-angry"></i>
            </span>
            RMSanity
         </h1>
         <div className="container">
            <div className="columns">
               <div className="column is-one-quarter">
                  <Menu
                     filter={filter}
                     setFilter={setFilter}
                     categories={all_categories}
                  />
                  <OverallStats data={data} slow={slow} warnings={warnings} />
               </div>
               <div className="column is-three-quarters">
                  <Queries current_selection={current_selection} />
               </div>
            </div>
         </div>
      </>
   )
}

const MenuSection = ['General', 'Warnings', 'Tables']

const optionalClass = (predicate, className, others) =>
   (predicate ? className : '') + ' ' + others

const Menu = ({ categories, filter, setFilter }) => {
   const groups = _.groupBy(categories, (x) => x.category)

   return (
      <aside className="menu">
         {_.map(MenuSection, (s) => {
            const group = _.orderBy(groups[s], (x) => x.data.length, 'desc')
            return (
               <React.Fragment key={s}>
                  <p className="menu-label">{s}</p>
                  <ul className="menu-list">
                     {group.map((c) => (
                        <li key={c.key}>
                           <a
                              className={optionalClass(
                                 filter === c.key,
                                 'is-active'
                              )}
                              onClick={() => setFilter(c.key)}
                           >
                              <span
                                 className={optionalClass(
                                    s === 'Warnings' && c.data.length > 0,
                                    'is-warning',
                                    optionalClass(
                                       c.data.length > 0,
                                       'is-info',
                                       'tag mr-2'
                                    )
                                 )}
                              >
                                 {c.data.length}
                              </span>
                              {c.title}
                           </a>
                        </li>
                     ))}
                  </ul>
               </React.Fragment>
            )
         })}
      </aside>
   )
}

const OverallStats = ({ data, slow, warnings }) => {
   const sorted_by_duration = _.orderBy(data, (x) => x.duration, 'desc')
   const slowest = sorted_by_duration[0]
   const average_duration = Math.floor(
      _.sumBy(data, (x) => x.duration) / data.length
   )

   return (
      <div className="columns is-multiline mt-5">
         <div className="has-text-centered column is-full">
            <div>
               <p className="heading">Queries</p>
               <p className="title is-size-4">{data.length}</p>
            </div>
         </div>
         <div className="has-text-centered column is-full">
            <div>
               <p className="heading">Slow ({'>'}= 1s)</p>
               <p className="title is-size-4">{slow.data.length}</p>
            </div>
         </div>
         <div className="has-text-centered column is-full">
            <div>
               <p className="heading">Warnings</p>
               <p className="title is-size-4">{warnings.data.length}</p>
            </div>
         </div>
         <div className="has-text-centered column is-full">
            <div>
               <p className="heading">Slowest</p>
               <p className="title is-size-4">{slowest.duration} ms</p>
            </div>
         </div>
         <div className="has-text-centered column is-full">
            <div>
               <p className="heading">Average</p>
               <p className="title is-size-4">{average_duration} ms</p>
            </div>
         </div>
      </div>
   )
}

const Queries = ({ current_selection }) => {
   const grouped_queries = _.groupBy(current_selection.data, (x) => x.test_name)
   return (
      <div>
         <nav className="level">
            <div className="level-left">
               <h2 className="title is-3">{current_selection.title}</h2>
            </div>
         </nav>
         {_.map(grouped_queries, (group, k) => {
            return <QueryGroup key={k} group={group} />
         })}
      </div>
   )
}

const QueryGroup = ({ group }) => {
   const queries = group
   const first_query = queries[0]
   const duration_ms = _.sumBy(group, (x) => x.duration)

   const [isCollapsed, setIsCollapsed] = useState(true)

   let className = ''
   if (isCollapsed) {
      className = 'hidden'
   }

   const all_warnings = _(group)
      .map((x) => x.warnings)
      .flatten()
      .compact()
      .uniq()
      .value()

   const all_settings = _(group)
      .map((q) => q.settings)
      .reduce((x, r) => _.mergeWith(x, r))

   return (
      <div className="card mb-2">
         <header className="card-header">
            <div className="card-header-title">
               <div className="level">
                  <div className="has-text-light level-left">
                     <span className="tag tag-info is-size-7 mr-2">
                        {queries.length}
                     </span>
                     <span className="is-size-7">{first_query.test_name}</span>
                  </div>
                  <div className="has-text-right level-right">
                     <Warnings values={all_warnings} />
                     {_.map(all_settings, (v, k) => {
                        return (
                           <span
                              title={k}
                              key={k}
                              className="tag ml-2 is-info is-light"
                           >
                              {v}
                           </span>
                        )
                     })}

                     <span className="ml-2 has-text-weight-light">
                        {duration_ms} ms
                     </span>
                  </div>
               </div>
            </div>

            <a
               className="card-header-icon"
               aria-label="more options"
               onClick={() => setIsCollapsed(!isCollapsed)}
            >
               <span className="icon">
                  <i
                     className={`fas fa-angle-${isCollapsed ? 'left' : 'down'}`}
                     aria-hidden="true"
                  ></i>
               </span>
            </a>
         </header>
         <div className={'card-content ' + (isCollapsed ? 'is-hidden' : '')}>
            {group.map((d, i) => {
               return (
                  <div key={i}>
                     <div
                        className={optionalClass(
                           d.tx_id !== 0,
                           'transaction',
                           'query'
                        )}
                     >
                        <Warnings values={d.warnings} />
                        <Highlight
                           className={'code is-size-7' + className}
                           language="sql"
                        >
                           {SqlFormatter.format(
                              queryWithVars(d.query, d.sql_vars)
                           )}
                        </Highlight>
                        {d.tx_id !== 0 ? (
                           <span className="tag is-size-6 transaction-tag is-link">
                              {mapTxId(d.tx_id)}
                           </span>
                        ) : null}

                        <pre className="is-size-7 mb-5 stack-trace">
                           {d.stack_trace}
                        </pre>
                     </div>
                  </div>
               )
            })}
         </div>
      </div>
   )
}

const queryWithVars = (query, vars) => {
   if (_.isEmpty(vars)) {
      return query
   }
   let offset = 0
   return query
      .replace(/\$\d+/g, (r, i) => {
         const value = vars[r.substr(1)]
         return value ? `"${value}"` : 'ZERO_VALUE'
      })
      .replace(/\?/g, () => {
         const value = vars[offset++]
         return value ? `"${value}"` : 'ZERO_VALUE'
      })
}

const Warnings = ({ values }) => {
   return (
      <div className="warnings">
         {_.map(values, (w) => {
            return (
               <span key={w} className="tag ml-2 is-warning">
                  {w}
               </span>
            )
         })}
      </div>
   )
}

ReactDOM.render(<App data={window.RAW_DATA} />, document.getElementById('root'))
