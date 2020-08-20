
const App = ({ data }) => {
    return data.map((d, i) => {
        return (<div key={i}>{JSON.stringify(d.query)}</div>)
    })
}


