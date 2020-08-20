import 'bulma'
import '@fortawesome/fontawesome-free/css/all.css'
import React, { useState } from 'react'
import ReactDOM from 'react-dom'
import Highlight from 'react-highlight.js'
import Moment from 'moment'
import SqlFormatter from 'sql-formatter'
import _ from 'lodash'

import './app.scss'

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
      data: data,
   }

   const slow = {
      title: 'Slow',
      key: 'slow',
      data: data.filter((q) => q.is_slow),
   }

   const warnings = {
      title: 'Warn',
      key: 'Warn',
      data: data.filter((q) => !_.isEmpty(q.warnings)),
   }

   const sorted_by_duration = _.orderBy(data, (x) => x.duration, 'desc')
   const slowest = sorted_by_duration[0]
   const average_duration = Math.floor(
      _.sumBy(data, (x) => x.duration) / data.length
   )
   const categories = [all, slow, warnings]

   const current_selection = categories.find((x) => x.key === filter)

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
                  <aside className="menu">
                     <nav className="level">
                        <div className="level-left">
                           <div className="level-item">
                              <div className="field has-addons">
                                 <p className="control">
                                    <input
                                       className="input"
                                       type="text"
                                       placeholder="Find a query"
                                    />
                                 </p>
                                 <p className="control">
                                    <button className="button">Search</button>
                                 </p>
                              </div>
                           </div>
                        </div>
                     </nav>
                     <p className="menu-label">Category</p>
                     <ul className="menu-list">
                        <li>
                           <a className="is-active">All</a>
                        </li>
                        <li>
                           <a>Slowest</a>
                        </li>
                        <li>
                           <a>Frequency</a>
                        </li>
                     </ul>
                     <p className="menu-label">Warnings</p>
                     <ul className="menu-list">
                        <li>
                           <a>Missing WHERE</a>
                        </li>
                        <li>
                           <a>Odd Transactions</a>
                        </li>
                     </ul>
                  </aside>

                  <div className="columns is-multiline mt-5">
                     <div className="has-text-centered column is-full">
                        <div>
                           <p className="heading">Queries</p>
                           <p className="title is-size-4">{data.length}</p>
                        </div>
                     </div>
                     <div className="has-text-centered column is-full">
                        <div>
                           <p className="heading">Slow (>= 1s)</p>
                           <p className="title is-size-4">{slow.data.length}</p>
                        </div>
                     </div>
                     <div className="has-text-centered column is-full">
                        <div>
                           <p className="heading">Warnings</p>
                           <p className="title is-size-4">
                              {warnings.data.length}
                           </p>
                        </div>
                     </div>
                     <div className="has-text-centered column is-full">
                        <div>
                           <p className="heading">Slowest</p>
                           <p className="title is-size-4">
                              {slowest.duration} ms
                           </p>
                        </div>
                     </div>
                     <div className="has-text-centered column is-full">
                        <div>
                           <p className="heading">Average</p>
                           <p className="title is-size-4">
                              {average_duration} ms
                           </p>
                        </div>
                     </div>
                  </div>
               </div>
               <div className="column">
                  <div>
                     <nav className="level">
                        <div className="level-left">
                           <h2 className="title is-3">
                              {current_selection.title}
                           </h2>
                        </div>
                        <div className="level-right">
                           {_.map(categories, (f) => {
                              var wrapped = (x) => {
                                 if (filter === f.key ? 'is-active' : '') {
                                    return <strong>{x}</strong>
                                 }
                                 return x
                              }
                              return (
                                 <p key={f.key} className="level-item">
                                    <a onClick={() => setFilter(f.key)}>
                                       {wrapped(
                                          <span className="mr-2">
                                             {f.title}
                                          </span>
                                       )}
                                       <span className="tag">
                                          {f.data.length}
                                       </span>
                                    </a>
                                 </p>
                              )
                           })}
                        </div>
                     </nav>

                     <Queries data={current_selection.data} />
                  </div>
               </div>
            </div>
         </div>
      </>
   )
}

const Queries = ({ data }) => {
   const grouped_queries = _.groupBy(data, (x) => x.db_instance_id)
   return _.map(grouped_queries, (group, k) => {
      return <QueryGroup key={k} group={group} />
   })
}

const pluralize = (count, single, multiple) => {
   if (count !== 1) {
      return multiple
   }
   return single
}

const QueryGroup = ({ group }) => {
   const queries = group
   const first_query = queries[0]
   const last_query = queries[queries.length - 1]
   const duration_ms = Moment.duration(
      Moment(last_query.end_time).diff(Moment(first_query.start_time))
   ).asMilliseconds()

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

   const all_tables = _.map(group, (q) => q.table_name)

   return (
      <div className="card">
         <header className="card-header">
            <div className="card-header-title">
               <div class="level">
                  <div className="has-text-dark level-left">
                     <span className="mr-2">{all_tables.join(', ')}</span>
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
                        {queries.length}{' '}
                        {pluralize(queries.length, 'query', 'queries')} (
                        {duration_ms} ms)
                     </span>
                  </div>
               </div>
            </div>

            <a
               href="#"
               className="card-header-icon"
               aria-label="more options"
               onClick={() => setIsCollapsed(!isCollapsed)}
            >
               <span className="icon">
                  <i className="fas fa-angle-down" aria-hidden="true"></i>
               </span>
            </a>
         </header>
         <div className={'card-content ' + (isCollapsed ? 'is-hidden' : '')}>
            {group.map((d, i) => {
               return (
                  <div className="query" key={i}>
                     <div className="mb-2">
                        <Warnings values={d.warnings} />
                     </div>
                     <Highlight className={className} language="sql">
                        {SqlFormatter.format(d.query)}
                     </Highlight>
                     {_.isEmpty(d.sql_vars) ? null : (
                        <SQLVars vars={d.sql_vars} />
                     )}
                  </div>
               )
            })}
         </div>
      </div>
   )
}

const SQLVars = ({ vars }) => {
   return (
      <ul>
         {vars.map((v, i) => (
            <li key={i}>{'$' + (i + 1) + ' = ' + v}</li>
         ))}
      </ul>
   )
}

const Warnings = ({ values }) => {
   return _.map(values, (w) => {
      return (
         <span key={w} className="tag ml-2 is-warning">
            {w}
         </span>
      )
   })
}

ReactDOM.render(<App data={window.RAW_DATA} />, document.getElementById('root'))
