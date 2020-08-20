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
   return <Queries />
}

const Queries = () => {
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
      <div class="card">
         <header class="card-header">
            <p class="card-header-title">
               Query {first_query.db_instance_id} - {queries.length}{' '}
               {pluralize(queries.length, 'query', 'queries')} ({duration_ms}{' '}
               ms)
            </p>
            <a
               href="#"
               class="card-header-icon"
               aria-label="more options"
               onClick={() => setIsCollapsed(!isCollapsed)}
            >
               <span class="icon">
                  <i class="fas fa-angle-down" aria-hidden="true"></i>
               </span>
            </a>
         </header>
         <div class="card-content">
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
