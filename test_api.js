fetch("http://localhost:3000/api/history").then(r=>r.json()).then(d=>console.log(d.length > 0 ? d[0] : "Empty"));
