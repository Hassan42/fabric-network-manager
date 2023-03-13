const WriteYaml = require('write-yaml-file');
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');

const writeNetworkFile = (participants) => {

    organizations = {};
    orderers = {};
    peers = {};
    certificateAuthorities = {};
    channels = {};
  
    orderersPort = 7059;
    casPort = 8054;
    peersPort = 7051;
  
    orderers[`orderer.com`] = {
      name: `orderer.com`,
      url: `https://0.0.0.0:${orderersPort}`,
      org: `OrdererOrg`,
      mspid: `OrdererMSP`,
    }
  
    organizations[`OrdererOrg`] = {
      name: `OrdererOrg`,
      mspid: `OrdererMSP`,
      orderers: [`orderer.com`],
      certificateAuthorities:[`ca.Orderer.example.com`],
    }
  
    certificateAuthorities[`ca.Orderer.example.com`] = {
      url: `https://localhost:${casPort}`,
      caName: `ca.Orderer.example.com`,
      tlsCa: true,
      org: `OrdererOrg`,
      httpOptions:{ 
        verify: true
      }
    }
    casPort += 10;
  
    participants.forEach(participant =>{
  
      organizations[participant] = {
        name: participant,
        mspid: participant+"MSP",
        peers:[`peer.${participant}.example.com`],
        certificateAuthorities:[`ca.${participant}.example.com`],
      }
  
      peers[`peer.${participant}.example.com`] = {
        url: `https://0.0.0.0:${peersPort}`,
        name: `peer.${participant}.example.com`,
        org: participant,
        mspid: participant+"MSP",
      }
  
      certificateAuthorities[`ca.${participant}.example.com`] = {
        url: `https://localhost:${casPort}`,
        caName: `ca.${participant}.example.com`,
        tlsCa: true,
        org: participant,
        httpOptions:{ 
          verify: true
        }
      }
  
      peersPort += 30;
      casPort += 10;
    })
  
    peerNames = []
    Object.keys(peers).forEach(function(key) {
      peerNames.push(key);
    });
    
    ordererNames = [];
    Object.keys(orderers).forEach(function(key) {
      ordererNames.push(key);
    });
  
    channels = {
      "mychannel": {
        "orderers": ordererNames,
        "peers": peerNames,
      }
    }
  
    network = {
      "channels": channels,
      "organizations": organizations,
      "peers": peers,
      "orderers": orderers,
      "certificateAuthorities": certificateAuthorities,
  
    }
  
    WriteYaml.sync("./network.yaml", network)
}

const readConf = (confPath) => {
    const data = fs.readFileSync(confPath, 'utf8');
    const conf = YAML.parse(data);
    return conf;
}

const createDirectory = (directoryPath) => {
    const directoryPathExists = fs.existsSync(directoryPath);
    if (!directoryPathExists) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }
}

const initCa = (caPath, networkConf) => {

    const fabricCaName = caPath.split("/").pop();
  
    const fabricCaNetConf = fabricCaName != undefined ? networkConf.certificateAuthorities[fabricCaName] : {};
    const fabricCaUrl = new URL(fabricCaNetConf.url); 
    const fabricCaPort = Number(fabricCaUrl.port);
    const fabricCaOperationPort = fabricCaPort + 2;
    const https = fabricCaNetConf.httpOptions.verify;
    const fabricCaId = fabricCaNetConf.caName;
    const isTLS = fabricCaNetConf.tlsCa;
  
    // Modifying The TLS CA Server Configuration
    const fabricCaConfPath = caPath + "/fabric-ca-server-config.yaml";
    const fabricCaConfExists = fs.existsSync(caPath + "/fabric-ca-server-config.yaml");
  
    if (!fabricCaConfExists) {
        console.log(`${fabricCaName} configuration file is missing.`)
    }
  
    const fabricCaContent = fs.readFileSync(fabricCaConfPath, 'utf8');
  
    const fabricCaConf = YAML.parse(fabricCaContent);
  
    fabricCaConf.port = fabricCaPort;
    fabricCaConf.tls.enabled = https;
    fabricCaConf.ca.name = fabricCaId;
    fabricCaConf.csr.hosts = [fabricCaName, fabricCaUrl.hostname]
    fabricCaConf.operations.listenAddress = "127.0.0.1" + ":" + fabricCaOperationPort
  
    // if(isTLS){
    // delete fabricCaConf.signing.profiles.ca;}
    // else{
        // const fabricCaAdminPath = path.resolve(caPath, "../../User/caAdmin/tls/");
        // fabricCaConf.tls.certfile = fabricCaAdminPath + "/signcerts/cert.pem" 
        // fabricCaConf.tls.keyfile = fabricCaAdminPath + "/keystore/key.pem"
    // }
  
    WriteYaml.sync(fabricCaConfPath, fabricCaConf);
  
    // console.log(`${fabricCaName}: Server configuration done.`)
  
    const fabricCaComposePath = path.resolve(caPath, "../../../config/compose-ca.yaml");
    // if(isTLS){
    // fabricCaComposePath = path.resolve(caPath, "../../../config/compose-tls-ca.yaml");
    // }
  
    const fabricCaComposeExists = fs.existsSync(fabricCaComposePath);
  
    if (!fabricCaComposeExists) {
        console.log(`${fabricCaName} configuration file is missing.`)
    }
  
    const fabricCaComposeConf = readConf(fabricCaComposePath);
  
    if (!fabricCaComposeConf.services){
        fabricCaComposeConf.services = {}
    }
  
    fabricCaComposeConf.services[fabricCaName || ""] = {
        "image": "hyperledger/fabric-ca:latest",
        "labels": {"service": "hyperledger-fabric"},
        "ports": [`${fabricCaPort}:${fabricCaPort}`, `${fabricCaOperationPort}:${fabricCaOperationPort}`],
        "command": "sh -c 'fabric-ca-server start -b admin:adminpw -d'",
        "volumes": [`${caPath}:/etc/hyperledger/fabric-ca-server`],
        "container_name": fabricCaName,
        "networks": ["test"],
    }
  
    WriteYaml.sync(fabricCaComposePath, fabricCaComposeConf);
}
  
const initPeer = (peer) => {
  
    const peerName = peer.name;
    const peerOrg = peer.org;
    const peerMspId = peer.mspid;
    const peerUrl = new URL(peer.url);
    const peerPort = Number(peerUrl.port);
    const peerOperationPort = peerPort + 2;
    const peerChainCodePort = peerPort + 1;
    const peerPath = path.resolve("network", peerOrg, "Peers", peerName);
  
    const tlsCertPath = "/etc/hyperledger/fabric/tls/signcerts/cert.pem";
    const tlsKeyPath = "/etc/hyperledger/fabric/tls/keystore/key.pem";
    const tlsCertRootPath = "/etc/hyperledger/fabric/tls/tlscacerts/tls-ca-cert.pem";
    // const fileSystmePath = path.resolve(peerPath, "var/hyperledger/production");
    // const peerStatePath = path.resolve(peerPath, "var/hyperledger/production/snapshots");
  
    const peerCoreContent = fs.readFileSync(peerPath + "/core.yaml", 'utf8');
    const peerCore = YAML.parse(peerCoreContent);
  
    peerCore.peer.id = peerName;
    peerCore.peer.networkId = "test";
    peerCore.peer.listenAddress = peerUrl.host;
    peerCore.peer.address = peerName + ":" + peerUrl.port;
    peerCore.peer.chaincodeListenAddress = peerUrl.hostname + ":" + peerChainCodePort;
    peerCore.peer.chaincodeAddress = peerName + ":" + peerChainCodePort;
    peerCore.peer.localMspId = peerMspId;
    // peerCore.peer.fileSystemPath = fileSystmePath;
    peerCore.peer.gossip.bootstrap = peerName + ":" + peerUrl.port;
    peerCore.peer.gossip.endpoint = peerName + ":" + peerUrl.port;
    peerCore.peer.gossip.externalEndpoint = peerName + ":" + peerUrl.port;
    peerCore.peer.tls.enabled = "true";
    peerCore.peer.tls.cert.file = tlsCertPath;
    peerCore.peer.tls.key.file = tlsKeyPath;
    peerCore.peer.tls.rootcert.file = tlsCertRootPath;
    // peerCore.ledger.snapshots.rootDir = peerStatePath;
    peerCore.operations.listenAddress = peerUrl.hostname + ":" + peerOperationPort;
    peerCore.vm.endpoint = "unix:///host/var/run/docker.sock";
    peerCore.vm.docker.hostConfig.NetworkMode = "fabric_test"
  
    WriteYaml.sync(peerPath + "/core.yaml", peerCore);
  
    const fabricNetComposePath = path.resolve("network", "config", "compose-network.yaml");
  
    const fabricNetComposeExists = fs.existsSync(fabricNetComposePath);
  
    if (!fabricNetComposeExists) {
        throw(`compose file is missing.`)
    }
  
    const fabricNetComposeConf = readConf(fabricNetComposePath);
  
    if (!fabricNetComposeConf.services){
      fabricNetComposeConf.services = {}
    }
  
    fabricNetComposeConf.services[peerName || ""] = {
      "image": "hyperledger/fabric-peer:latest",
      "labels": {"service": "hyperledger-fabric"},
      "ports": [`${peerPort}:${peerPort}`, `${peerChainCodePort}:${peerChainCodePort}`, `${peerOperationPort}:${peerOperationPort}`],
      "volumes": [`${peerPath}:/etc/hyperledger/fabric`, `${peerPath}:/var/hyperledger/production`, `/var/run/docker.sock:/host/var/run/docker.sock`],
      "container_name": peerName,
      "networks": ["test"],
    }
  
    WriteYaml.sync(fabricNetComposePath, fabricNetComposeConf);
  
}
  
const initOrderer = (orderer) => {
  
      const ordererName = orderer.name;
      const ordererUrl =  new URL(orderer.url);
      const ordererPort = Number(ordererUrl.port);
      const ordererOperationPort = ordererPort + 3;
      const ordereradminPort = ordererPort + 2;
      const ordererOrg = orderer.org;
      const ordererMspId = orderer.mspid;
      const orderPath = path.resolve("network", ordererOrg, "orderers", ordererName);
  
      const tlsCertPath = "/etc/hyperledger/fabric/tls/signcerts/cert.pem";
      const tlsKeyPath = "/etc/hyperledger/fabric/tls/keystore/key.pem";
      const tlsCertRootPath = "/etc/hyperledger/fabric/tls/tlscacerts/tls-ca-cert.pem";
      // const fileLedgerPath = path.resolve(orderPath, "var/hyperledger/production/orderer");
      // const walDirPath = path.resolve(orderPath, "var/hyperledger/production/orderer/etcdraft/wal");
      // const SnapDirPath = path.resolve(orderPath, "var/hyperledger/production/orderer/etcdraft/snapshot");
  
      const ordererConfContent = fs.readFileSync(orderPath + "/orderer.yaml", 'utf8');
      const ordererConf = YAML.parse(ordererConfContent);
      
      ordererConf.General.ListenAddress = ordererUrl.hostname;
      ordererConf.General.ListenPort = ordererPort;
      ordererConf.General.TLS.Enabled = true;
      ordererConf.General.TLS.PrivateKey = tlsKeyPath;
      ordererConf.General.TLS.Certificate = tlsCertPath;
      delete ordererConf.General.TLS.RootCAs;
      ordererConf.General.BootstrapMethod = "none";
      ordererConf.General.LocalMSPID = ordererMspId;
      // ordererConf.FileLedger.Location = fileLedgerPath
      ordererConf.Operations.ListenAddress = ordererUrl.hostname + ":" + ordererOperationPort;
      ordererConf.Admin.ListenAddress = ordererUrl.hostname + ":" + ordereradminPort;
      ordererConf.Admin.TLS.Enabled = true;
      ordererConf.Admin.TLS.Certificate = tlsCertPath;
      ordererConf.Admin.TLS.PrivateKey = tlsKeyPath;
      ordererConf.Admin.TLS.ClientRootCAs = tlsCertRootPath;
      ordererConf.ChannelParticipation.Enabled = true;
      // ordererConf.Consensus.WALDir = walDirPath;
      // ordererConf.Consensus.SnapDir = SnapDirPath;
  
      // createDirectory(orderPath + "/config");
  
      WriteYaml.sync(orderPath + "/orderer.yaml", ordererConf);
  
      // fs.unlinkSync(orderPath + "/orderer.yaml");
  
      const fabricNetComposePath = path.resolve("network", "config", "compose-network.yaml");
  
      const fabricNetComposeExists = fs.existsSync(fabricNetComposePath);
  
      if (!fabricNetComposeExists) {
          throw(`compose file is missing.`);
      }
  
  
      const fabricNetComposeConf = readConf(fabricNetComposePath);
  
      if (!fabricNetComposeConf.services){
        fabricNetComposeConf.services = {}
      }
  
      fabricNetComposeConf.services[ordererName || ""] = {
        "image": "hyperledger/fabric-orderer:latest",
        "labels": {"service": "hyperledger-fabric"},
        "ports": [`${ordererPort}:${ordererPort}`, `${ordererOperationPort}:${ordererOperationPort}`, `${ordereradminPort}:${ordereradminPort}`],
        "volumes": [`${orderPath}:/etc/hyperledger/fabric`, `${orderPath}:/var/hyperledger/fabric/config` ,`${orderPath}:/var/hyperledger/production`],
        "container_name": ordererName,
        "networks": ["test"],
      };
    
      WriteYaml.sync(fabricNetComposePath, fabricNetComposeConf);
}

const enrollBash = async (ca, credential, enrollmentPath, enrollmentProfile = "ca", csrHost = []) => {

    const caUrl = new URL(ca.url);
    const caName = ca.caName;
    const caOrg = ca.org;
    const fabricCaHosts = [caName, caUrl.hostname, "0.0.0.0"].concat(csrHost);
    const caPath = path.resolve("network", caOrg, "Cas", caName);
    const tlsRootCertificateDir = path.resolve(caPath, "ca-cert.pem");
  
    const args = ["enroll", "-d", "-u", `https://${credential.username}:${credential.password}@${caUrl.host}`, "--tls.certfiles", tlsRootCertificateDir, "--mspdir", enrollmentPath, "--csr.hosts", fabricCaHosts.join(",")]
  
    if(enrollmentProfile == "tls"){
      args.push( "--enrollment.profile", "tls");
    }
  
    const fabricCaClientBin = path.resolve("binaries", "fabric-ca-client");
  
    const enrollment = execSync(`${fabricCaClientBin} ${args.join(" ")}`, {stdio : 'pipe' });
  
    //Renaming Root Cert
    if(enrollmentProfile == "ca"){
      const caRootCertPath = path.resolve(enrollmentPath, "cacerts"); 
      const caRoots = fs.readdirSync(caRootCertPath);
        
      if(caRoots){
          const oldCaRoot = caRootCertPath + "/" + caRoots.pop();
          const newCaRoot = caRootCertPath + "/ca-cert.pem";
          fs.renameSync(oldCaRoot, newCaRoot);
      }
  
      const caKeyRootCertPath = path.resolve(enrollmentPath, "keystore"); 
      const caKeyRoots = fs.readdirSync(caKeyRootCertPath);
  
      if(caKeyRoots){
        const oldCaKeyRoot = caKeyRootCertPath + "/" + caKeyRoots.pop();
        const newCaKeyRoot = caKeyRootCertPath + "/key.pem";
        fs.renameSync(oldCaKeyRoot, newCaKeyRoot);
      }
  
  
    } 
    if(enrollmentProfile == "tls"){
      const tlsCaRootCertPath = path.resolve(enrollmentPath, "tlscacerts"); 
      const tlsCaRoots = fs.readdirSync(tlsCaRootCertPath);
        
      if(tlsCaRoots){
          const oldTlsCaRoot = tlsCaRootCertPath + "/" + tlsCaRoots.pop();
          const newTlsCaRoot = tlsCaRootCertPath + "/tls-ca-cert.pem";
          fs.renameSync(oldTlsCaRoot, newTlsCaRoot);
      }
  
      const tlsKeyRootCertPath = path.resolve(enrollmentPath, "keystore"); 
      const tlsKeyRoots = fs.readdirSync(tlsKeyRootCertPath);
  
      if(tlsKeyRoots){
        const oldTlsKeyRoot = tlsKeyRootCertPath + "/" + tlsKeyRoots.pop();
        const newTlsKeyRoot = tlsKeyRootCertPath + "/key.pem";
        fs.renameSync(oldTlsKeyRoot, newTlsKeyRoot);
      }
    }
  
  
    return enrollment;
  
}
  
const registerBash = async (ca, credential, type=undefined) => {
  
    const caUrl = new URL(ca.url);
    const caName = ca.caName;
    const caOrg = ca.org;
    const caPath = path.resolve("network", caOrg, "Cas", caName);
    const singingDir = path.resolve("network", caOrg, "User", "caAdmin", "msp");
    const tlsRootCertificateDir = path.resolve(caPath, "ca-cert.pem");
  
    const args = ["register", "-d", "--id.name", credential.username, "--id.secret", credential.password, "-u", caUrl.toString().slice(0,-1), "--tls.certfiles", tlsRootCertificateDir, "--mspdir", singingDir];
  
    if(type){
      args.push("--id.type", type);
    }
  
    const fabricCaClientBin = path.resolve("binaries", "fabric-ca-client");
  
    const register = execSync(`${fabricCaClientBin} ${args.join(" ")}`, {stdio : 'pipe' });
  
    return register;
  
}

const checkEndpoint = async (url) => {

    const urlHost = "http://" + url.host;
    return new Promise(async (res,rej)=>{
    try{
      const response = await fetch(urlHost, {
        method: "GET"
      })
      res();
    }
    catch(error){
      await checkEndpoint(url);
      res();
    }
    });
}

const dockerUp = (dockerFile) => {
    const dockerCompose = execSync(`docker-compose -f ${dockerFile} up -d`, {stdio : 'pipe' });
    return dockerCompose;
}
  
const configtx = (profile, outputPath, channelId) => {
    const configtxBin = path.resolve("binaries", "configtxgen");
    const networkConfigDir = path.resolve("network", "config");  
    const args = ["-profile", profile, "-outputBlock", outputPath, "-channelID", channelId];
    const configtxOut = execSync(`${configtxBin} ${args.join(" ")}`, {cwd: networkConfigDir, stdio : 'pipe'});
    return configtxOut;
}

const delay = (delayInms) => {
    return new Promise(resolve => setTimeout(resolve, delayInms));
}

const writeConnectionFile = (networkPath) => {

  const networkConf = readConf(networkPath);
  const organizations = networkConf.organizations;
  const peers = networkConf.peers;
  const cas = networkConf.certificateAuthorities;

  const connectionOrginizations = {};
  const connectionPeers = {};
  const connectionCas = {};

  Object.keys(organizations).forEach(organizationKey => {
    const orginization = organizations[organizationKey];

    if('peers' in orginization){
      orginization.peers.forEach((peerId) => {
        const peer = peers[peerId];
        const peerUrl = new URL(peer.url);
        connectionPeers[peerId] = {
          "url": "grpcs://" + peerUrl.host,
          "tlsCACerts": {"path":path.resolve("network", organizationKey, "Peers", peerId, "tls", "tlscacerts", "tls-ca-cert.pem")},
           "grpcOptions":{
            "ssl-target-name-override": peer.name,
            "hostnameOverride": peer.name}
        }
      })
    }

    if('certificateAuthorities' in orginization){
      orginization.certificateAuthorities.forEach((caId) => {

        const ca = cas[caId];
        const caCert = fs.readFileSync(path.resolve("network", organizationKey, "Cas", caId, "tls-cert.pem"), "utf8");
        connectionCas[caId] = {
          "url": ca.url,
          "caName": ca.caName,
          "tlsCACerts": {"pem":caCert},
          "httpOptions": {"verify": false}
        }
       
      })
    }


    connectionOrginizations[organizationKey] = {
      "mspid": orginization.mspid,
      "peers": orginization.peers || [],
      "certificateAuthorities": orginization.certificateAuthorities
    }

  })

  const connectionFile = {
    "networkConfiguration":{
    "name": "test-network",
    "version": "1.0.0",
    "organizations": connectionOrginizations,
    "peers": connectionPeers,
    "certificateAuthorities": connectionCas,
    }
  }

  WriteYaml.sync("connection.yaml", connectionFile);

  return connectionFile;

}


exports.writeNetworkFile = writeNetworkFile;
exports.readConf = readConf;
exports.createDirectory = createDirectory;
exports.initCa = initCa;
exports.initPeer = initPeer;
exports.initOrderer = initOrderer;
exports.enrollBash = enrollBash;
exports.registerBash = registerBash;
exports.checkEndpoint = checkEndpoint;
exports.dockerUp = dockerUp;
exports.configtx = configtx;
exports.delay = delay;
exports.writeConnectionFile = writeConnectionFile;