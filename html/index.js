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
      data: data.filter((q) => {
         return q.is_slow
      }),
   }

   const warnings = {
      title: 'Warn',
      key: 'Warn',
      data: [],
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
            <span class="icon has-text-danger">
               <i class="fas fa-angry"></i>
            </span>
            RMSanity
         </h1>
         <div className="container">
            <div class="columns">
               <div class="column is-one-quarter">
                  <aside class="menu">
                     <nav className="level">
                        <div className="level-left">
                           <div class="level-item">
                              <div class="field has-addons">
                                 <p class="control">
                                    <input
                                       class="input"
                                       type="text"
                                       placeholder="Find a query"
                                    />
                                 </p>
                                 <p class="control">
                                    <button class="button">Search</button>
                                 </p>
                              </div>
                           </div>
                        </div>
                     </nav>
                     <p class="menu-label">Category</p>
                     <ul class="menu-list">
                        <li>
                           <a class="is-active">All</a>
                        </li>
                        <li>
                           <a>Slowest</a>
                        </li>
                        <li>
                           <a>Frequency</a>
                        </li>
                     </ul>
                     <p class="menu-label">Warnings</p>
                     <ul class="menu-list">
                        <li>
                           <a>Missing WHERE</a>
                        </li>
                        <li>
                           <a>Odd Transactions</a>
                        </li>
                     </ul>
                  </aside>

                  <div class="columns is-multiline mt-5">
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
               <div class="column">
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

   return (
      <div className="card">
         <header className="card-header">
            <p className="card-header-title has-text-dark">
               {queries.length} {pluralize(queries.length, 'query', 'queries')}{' '}
               ({duration_ms} ms) - {first_query.db_instance_id}
            </p>
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
                     <Highlight className={className} language="sql">
                        {SqlFormatter.format(d.query)}
                     </Highlight>
                  </div>
               )
            })}
         </div>
      </div>
   )
}

ReactDOM.render(<App data={window.RAW_DATA} />, document.getElementById('root'))
