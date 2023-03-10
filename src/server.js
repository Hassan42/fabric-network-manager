const {execSync} = require('child_process');
const express = require('express');
const {writeNetworkFile} = require("./utils")
const app = express();

app.use(express.json());

app.post('/startNetwork', function (req, res) {

    try{
    const choreographyInfo = req.body;
    writeNetworkFile(choreographyInfo["participants"]);
    const gulpOutput = execSync(`gulp`).toString();
    console.log(gulpOutput);
    res.sendStatus(200);
    }catch(error){
    console.error(error);
    res.sendStatus(500);
    }


   
    
})

app.listen(3000)