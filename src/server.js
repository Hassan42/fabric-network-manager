const {execSync} = require('child_process');
const express = require('express');
const path = require('path');
const {writeNetworkFile, writeConnectionFile} = require("./utils")
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

app.post('/deployCC', function (req, res){
    try{
    const ccName = req.body["ccName"];
    const ccPath = path.resolve("chaincodes", ccName);
    const gulpOutput = execSync(`gulp --deployChaincode --ccPath ${ccPath}`).toString();
    console.log(gulpOutput);
    res.sendStatus(200);
    }
    catch(error){
    console.error(error);
    res.sendStatus(500);
    }
})

app.get('/connectionFile', function (req, res){
    const connectionFile = writeConnectionFile("network.yaml");
    res.json(connectionFile);
})

app.listen(3000)