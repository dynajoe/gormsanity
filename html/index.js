
const App = ({ data }) => {
    return data.map((d, i) => {
        return (
        <div key={i}>
           <pre><code class="sql">{d.query}</code></pre>
        </div>
        )
    })
}


