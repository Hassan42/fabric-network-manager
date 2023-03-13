const {execSync} = require('child_process');
const fs = require('fs');
const YAML = require('yaml');
const WriteYaml = require('write-yaml-file');
const path = require('path');
const { series, parallel } = require('gulp');
const minimist = require('minimist');
const {readConf, createDirectory, initCa, initOrderer, initPeer, registerBash, enrollBash, dockerUp, configtx, checkEndpoint, delay} = require('./src/utils');

// var args = minimist(process.argv.slice(2));

var options = {
    chaincodeLabel: "",
    packagePath: "",
}

options = minimist(process.argv.slice(2), options);

if(options.deployChaincode){
    options["chaincodeLabel"] = options["ccPath"].split("/").slice(-1)[0];
    options["packagePath"] = path.resolve("network", "artifact", `${options["chaincodeLabel"]}.tar.gz`);}




function initNetworkStructure(cb){

    fs.rmSync("network", { recursive: true, force: true });
  
    const networkConf = readConf("network.yaml");
  
    const networkPath = path.resolve("network");
    const networkConfig = path.resolve("network", "config");
    const networkArtifact = path.resolve("network", "artifact");
    const configDirectory = path.resolve("config");
  
    createDirectory(networkPath);
    createDirectory(networkConfig);
    createDirectory(networkArtifact);
    fs.copyFileSync(configDirectory + "/configtx.yaml", networkConfig + "/configtx.yaml");
  
  
    fs.copyFileSync(configDirectory + "/compose-ca.yaml", networkConfig + "/compose-ca.yaml");
    fs.copyFileSync(configDirectory + "/compose-ca.yaml", networkConfig + "/compose-tls-ca.yaml");
    fs.copyFileSync(configDirectory + "/compose-network.yaml", networkConfig + "/compose-network.yaml");
    // fs.copyFileSync(binaryDirectory + "/config/configtx.yaml", networkConfig + "/configtx.yaml");
  
    Object.keys(networkConf.organizations).forEach(organizationKey => {
  
    const orginization = networkConf.organizations[organizationKey];
    const orginizationPath = path.resolve("network", organizationKey);
    const orginizationMspPath = path.resolve("network", organizationKey, "msp");
    const orginizationMspCaPath = path.resolve(orginizationMspPath, "cacerts");
    const orginizationMspTlsPath = path.resolve(orginizationMspPath, "tlscacerts");
    const orginizationUserPath = path.resolve("network", organizationKey, "User");
  
    createDirectory(orginizationPath);
    createDirectory(orginizationMspPath);
    createDirectory(orginizationMspCaPath);
    createDirectory(orginizationMspTlsPath);
    createDirectory(orginizationUserPath);
    fs.copyFileSync(configDirectory + "/config.yaml", orginizationMspPath + "/config.yaml");
  
    if('peers' in orginization){
    orginization.peers.forEach((peerId) => {
    const peerPath = path.resolve("network", organizationKey, `Peers/${peerId}`);
    const peerMspPath = path.resolve("network", organizationKey, `Peers/${peerId}/msp`);
    const peerTlsPath = path.resolve("network", organizationKey, `Peers/${peerId}/tls`);
    const peerBinaryPath = path.resolve("network",organizationKey,"Peers", peerId, "bin");
    const oldPeerCoreFilePath = path.resolve("config/core.yaml");
    const newPeerCorefilePath = path.resolve("network", organizationKey, `Peers/${peerId}/core.yaml`);
  
    createDirectory(peerPath);
    createDirectory(peerMspPath);
    createDirectory(peerTlsPath);
    createDirectory(peerBinaryPath);
    fs.copyFileSync(oldPeerCoreFilePath, newPeerCorefilePath);
    fs.copyFileSync(configDirectory + "/config.yaml", peerMspPath + "/config.yaml");
    
    const peers = networkConf.peers;
    initPeer(peers[peerId]);
  
    });}
  
    if('certificateAuthorities' in orginization){
    orginization.certificateAuthorities.forEach((ca) => {
    const caPath = path.resolve("network", organizationKey, `Cas/${ca}`);
    createDirectory(caPath);
    fs.copyFileSync(configDirectory + "/fabric-ca-server-config.yaml", caPath + "/fabric-ca-server-config.yaml");
      
  
    initCa(caPath, networkConf);
    });}
  
    if('orderers' in orginization){
    orginization.orderers.forEach((ordererId) => {
    const ordererPath = path.resolve("network", organizationKey, `Orderers/${ordererId}`);
    const ordererMspPath = path.resolve("network", organizationKey, `Orderers/${ordererId}/msp`);
    const templateOrdererFilePath = path.resolve("config/orderer.yaml");
    const newOrdererFilePath = path.resolve("network", organizationKey, `Orderers/${ordererId}/orderer.yaml`);
    
    createDirectory(ordererPath);
    createDirectory(ordererMspPath);
  
    fs.copyFileSync(templateOrdererFilePath, newOrdererFilePath);
    fs.copyFileSync(configDirectory + "/config.yaml", ordererMspPath + "/config.yaml");
  
    const orderers = networkConf.orderers;
  
    initOrderer(orderers[ordererId]);
    });}
  
    //Admin Users
    const tlsAdminPath = path.resolve("network", organizationKey, "User", "tlsAdmin");
    const tlsAdminRootCertPath = path.resolve("network", organizationKey, "User", "tlsAdmin/tls-root-cert");
    const caAdminPath = path.resolve("network", organizationKey, "User", "caAdmin");
    const caAdminTlsCertPath = path.resolve("network", organizationKey, "User", "caAdmin/tls");
    const fabricCaClientPath = path.resolve("network", organizationKey, "fabric-ca-client");
    const adminPath = path.resolve("network", organizationKey, "User", "Admin");
    const adminMspPath = path.resolve("network", organizationKey, "User", "Admin", "msp");
  
    createDirectory(tlsAdminPath);
    createDirectory(tlsAdminRootCertPath);
    createDirectory(caAdminPath);
    createDirectory(adminPath);
    createDirectory(adminMspPath);
    createDirectory(caAdminTlsCertPath);
    createDirectory(fabricCaClientPath);
    fs.copyFileSync(configDirectory + "/config.yaml", adminPath + "/msp/config.yaml");
    });
  
    cb();
  
}

async function dockerDown(cb){
    const caDockerFile = path.resolve("network", "config", "compose-ca.yaml");
    const netDockerFile = path.resolve("network", "config", "compose-network.yaml");
    execSync(`docker-compose -f ${caDockerFile} down --remove-orphans`, {stdio : 'pipe' });
    execSync(`docker-compose -f ${netDockerFile} down --remove-orphans`, {stdio : 'pipe' });
    cb();
}

async function caDockerUp(cb) {
    const dockerFile = path.resolve("network", "config", "compose-ca.yaml");
    dockerUp(dockerFile);
    cb();
}
  
async function setupOrgMsp(cb){
    const networkConf = readConf("network.yaml");
  
    const peers = networkConf.peers;
    const organizations = networkConf.organizations;
    const certificateAuthorities = networkConf.certificateAuthorities;
  
    for(orgKey in organizations){
      const orgMspPath = path.resolve("network", orgKey, "msp");
      const orgCas = organizations[orgKey].certificateAuthorities;
      const orgCaKey = orgCas[0]; //TODO: better configurations
      const orgCa = certificateAuthorities[orgCaKey];
      const orgCaUrl = new URL(orgCa.url);
      const orgCaPath = path.resolve("network", orgKey, "Cas", orgCa.caName);
      const tlsCaRootCertPath = path.resolve(orgCaPath, "ca-cert.pem");
      const caRootCertPath = path.resolve(orgCaPath, "ca-cert.pem");
      await checkEndpoint(orgCaUrl);
      fs.copyFileSync(tlsCaRootCertPath, orgMspPath + "/tlscacerts/tls-ca-cert.pem");
      fs.copyFileSync(caRootCertPath, orgMspPath + "/cacerts/ca-cert.pem");
    }
    cb();
}
  
async function enrollCaAdmin(cb){
  
    const networkConf = readConf("network.yaml");
  
    const certificateAuthorities = networkConf.certificateAuthorities;
  
    for (let caKey in certificateAuthorities) {
      const ca = certificateAuthorities[caKey];
      const caUrl = new URL(ca.url);
      const caName = ca.caName;
      const caOrg = ca.org;
      // const caPath = path.resolve("network", caOrg, "Cas" ,caKey);
      await checkEndpoint(caUrl);
  
      // const caClient = new FabricCAServices(caUrl, {verify:false}, caName);
      const caAdminDir = path.resolve("network", caOrg, "User", "caAdmin", "msp");
      // enroll(caClient, {username:"admin", password:"adminpw"}, caAdminDir);
      const enrollResponse = enrollBash(ca, {username:"admin", password:"adminpw"}, caAdminDir, [caName]);
  
      // while(!fs.existsSync(caPath + "/ca-cert.pem")){
      //   await delay(500);
      // }
      // await delay(1000);
  
      // const caClient = new FabricCAServices(caUrl, {verify:false}, caName);
      // const caAdminDir = path.resolve("network", caOrg, "User", "caAdmin", "msp");
      // enroll(caClient, {username:"admin", password:"adminpw"}, caAdminDir);
      // console.log("enrolled", caName);
  
  
      // const watcher = watch(caPath + "/*.pem", {delay:1000}, async function (){
      //   const caClient = new FabricCAServices(caUrl, {verify:false}, caName);
      //   const caAdminDir = path.resolve("network", caOrg, "User", "caAdmin", "msp");
      //   enroll(caClient, {username:"admin", password:"adminpw"}, caAdminDir);
      //   watcher.close();
      // })
    }
    cb();
}
  
async function regsiterEnrollPeers(cb){
  
    const networkConf = readConf("network.yaml");
  
    const peers = networkConf.peers;
    const organizations = networkConf.organizations;
    const certificateAuthorities = networkConf.certificateAuthorities;
  
    for (let peerKey in peers) {
      //TODO: Refactoring needed
      const peer = peers[peerKey];
      const peerName = peer.name;
      const peerOrgKey = peer.org;
      const peerOrg = organizations[peerOrgKey];
      const peerOrgName = peerOrg.name;
      const peerCaKey = peerOrg.certificateAuthorities[0]; //TODO: Better CA configuration
      const peerCa = certificateAuthorities[peerCaKey];
      const peerCaUrl = new URL(peerCa.url);
      const peerPath = path.resolve("network", peerOrgName, "Peers", peerName);
  
      await checkEndpoint(peerCaUrl);
  
      registerBash(peerCa, {username:peerName, password:"peerpw"}, "peer");
      enrollBash(peerCa, {username:peerName, password:"peerpw"}, peerPath + "/tls", "tls", [peerName]);
      enrollBash(peerCa, {username:peerName, password:"peerpw"}, peerPath + "/msp");
    }
    cb();
}
  
async function regsiterEnrollOrderers(cb){
  
    const networkConf = readConf("network.yaml");
  
    const orderers = networkConf.orderers;
    const organizations = networkConf.organizations;
    const certificateAuthorities = networkConf.certificateAuthorities;
  
    for (let ordererKey in orderers) {
      //TODO: Refactoring needed
      const orderer = orderers[ordererKey];
      const ordererName = orderer.name;
      const ordererOrgKey = orderer.org;
      const ordererOrg = organizations[ordererOrgKey];
      const ordererOrgName = ordererOrg.name;
      const ordererCaKey = ordererOrg.certificateAuthorities[0]; //TODO: Better CA configuration
      const ordererCa = certificateAuthorities[ordererCaKey];
      const ordererCaUrl = new URL(ordererCa.url);
      const ordererPath = path.resolve("network", ordererOrgName, "Orderers", ordererName);
  
      await checkEndpoint(ordererCaUrl);
  
      registerBash(ordererCa, {username:"orderer", password:"ordererpw"}, "orderer");
      enrollBash(ordererCa, {username:"orderer", password:"ordererpw"}, ordererPath + "/tls", "tls", [ordererName]);
      enrollBash(ordererCa, {username:"orderer", password:"ordererpw"}, ordererPath + "/msp");
    }
    cb();
}
  
async function regsiterEnrollAdmins(cb){
    const networkConf = readConf("network.yaml");
  
    const organizations = networkConf.organizations;
    const certificateAuthorities = networkConf.certificateAuthorities;
  
    for(orgKey in organizations){
      const orgCas = organizations[orgKey].certificateAuthorities;
      const orgCaKey = orgCas[0]; //TODO: better configurations
      const orgCa = certificateAuthorities[orgCaKey];
      const orgCaUrl = new URL(orgCa.url);
      await checkEndpoint(orgCaUrl);  
  
      const adminPath = path.resolve("network", orgKey, "User", "Admin");
      registerBash(orgCa, {username:"orgadmin", password:"orgadminpw"}, "admin");
      enrollBash(orgCa, {username:"orgadmin", password:"orgadminpw"}, adminPath + "/tls", "tls");
      enrollBash(orgCa, {username:"orgadmin", password:"orgadminpw"}, adminPath + "/msp");
    }
    cb();
}

async function generateGensisBlock(cb){

    const networkConf = readConf("network.yaml");
  
    const orderers = networkConf.orderers;
    const organizations = networkConf.organizations;
    const peers = networkConf.peers;
  
    const channelOrderers = [];
    const channelOrginizations = [];
  
    const channelConfPath = path.resolve("network", "config", "configtx.yaml");
    const channelConf = readConf(channelConfPath);
  
    
    const ordererSection = channelConf.Orderer;
    delete ordererSection.Kafka;
    ordererSection.OrdererType = "etcdraft";
    ordererSection.Addresses = [];
    ordererSection.EtcdRaft.Consenters = [];
  
    for (let ordererKey in orderers) {
      const orderer = orderers[ordererKey];
      const ordererName = orderer.name;
      const ordererOrgName = orderer.org;
      const ordererMspId = orderer.mspid;
      const ordererUrl = new URL(orderer.url);
      const ordererPath = path.resolve("network", ordererOrgName, "Orderers", ordererName);
      const mspDirPath = path.resolve(ordererPath, "msp");
      const tlsDirPath = path.resolve(ordererPath, "tls");
  
      // channelOrderers.push(
      //   {
      //     Name: ordererName,
      //     ID: ordererMspId,
      //     MSPDir: mspDirPath,
      //     Policies: {
      //         Readers:{
      //             Type: "Signature",
      //             Rule: `OR('${ordererMspId}.member')`,
      //         },
      //         Writers:{
      //             Type: "Signature",
      //             Rule: `OR('${ordererMspId}.member')`,
      //         },
      //         Admins:{
      //             Type: "Signature",
      //             Rule: `OR('${ordererMspId}.admin')`,
      //         }
      //     },
      //     OrdererEndpoints: [ordererUrl.host],
      //   });
  
      ordererSection.Addresses.push(ordererName);
      ordererSection.EtcdRaft.Consenters.push(
        {
            Host: ordererName,
            Port: ordererUrl.port,
            ClientTLSCert: tlsDirPath + "/signcerts/cert.pem",
            ServerTLSCert: tlsDirPath + "/signcerts/cert.pem",
        });
     } 
  
     for (let orgKey in organizations) {
      const org = organizations[orgKey];
      const orgName = org.name;
      const mspId = org.mspid; 
      const mspDirPath = path.resolve("network", orgName, "msp");
    
  
      const orgChannelConf = {
        Name: orgName,
        ID: mspId,
        MSPDir: mspDirPath,
        Policies: {
            Readers:{
                Type: "Signature",
                Rule: `OR('${mspId}.admin', '${mspId}.peer', '${mspId}.client')`,
            },
            Writers:{
                Type: "Signature",
                Rule: `OR('${mspId}.admin', '${mspId}.client')`,
            },
            Admins:{
                Type: "Signature",
                Rule: `OR('${mspId}.admin')`,
            },
            Endorsement:{
                Type: "Signature",
                Rule: `OR('${mspId}.peer')`,
            }
        },
        
      }
  
      if ('peers' in org){
  
        anchorPeerKey = org.peers[0];
        anchorPeer = peers[anchorPeerKey];
        anchorPeerUrl = new URL(anchorPeer.url);
  
  
        orgChannelConf["AnchorPeers"] =
          [{Host: anchorPeer.name, Port:Number(anchorPeerUrl.port)}]
      
      }
  
      if('orderers' in org){
  
        orgChannelConf["Policies"] = {
        Readers:{
            Type: "Signature",
            Rule: `OR('${mspId}.member')`,
        },
        Writers:{
            Type: "Signature",
            Rule: `OR('${mspId}.member')`,
        },
        Admins:{
            Type: "Signature",
            Rule: `OR('${mspId}.admin')`,
        }
        }
  
        const orgOrderers = org.orderers;
        const orderer = orderers[orgOrderers[0]];
        const ordererName = orderer.name;
        const ordererUrl = new URL(orderer.url);
        const ordererPort = ordererUrl.port;
        
        orgChannelConf["OrdererEndpoints"] = [ordererName + ":" + ordererPort];
  
        channelOrderers.push(orgChannelConf);
  
      }
      else{
        channelOrginizations.push (orgChannelConf);
      }
  
      
     }
  
    channelConf.Organizations = channelOrginizations.concat(channelOrderers);
    channelConf.Orderer = ordererSection;
  
    channelConf.Profiles = {
      SampleAppChannel:{
          '<<': channelConf.Channel,
          Orderer:{
              '<<': channelConf.Orderer,
              OrdererType: "etcdraft",
              Organizations: channelOrderers
          },
          Application:{
              '<<': channelConf.Application,
              Organizations: channelOrginizations
          }
        }
      }
  
  
    WriteYaml.sync(channelConfPath, channelConf);
    var channelConfText = fs.readFileSync(channelConfPath, 'utf8');
    channelConfText = channelConfText.replace(/'(?=<<)/g, '');
    channelConfText = channelConfText.replace(/(?<=<)'/g, '');
    fs.writeFileSync(channelConfPath, channelConfText);
    
  
    const blockPath = path.resolve("network", "artifact", "genesis_block.pb");
      
    configtx("SampleAppChannel", blockPath, "channel1");
  
    cb();
}

async function networkDockerUp(cb){
    const dockerFile = path.resolve("network", "config", "compose-network.yaml");
    dockerUp(dockerFile);
    cb();
}

async function joinChannelOrderers(cb){

    const osnadminBin = path.resolve("binaries", "osnadmin");
    const channelName = "channel1";
    const blockPath = path.resolve("network", "artifact", "genesis_block.pb");
  
    const networkConf = readConf("network.yaml");
  
    const orderers = networkConf.orderers;
    const organizations = networkConf.organizations;
    const certificateAuthorities = networkConf.certificateAuthorities;
  
    for (let ordererKey in orderers) {
      const orderer = orderers[ordererKey];
      const ordererName = orderer.name;
      const ordererUrl = new URL(orderer.url);
      const ordererPort = Number(ordererUrl.port);
      const ordererOrgKey = orderer.org;
      const ordererOrg = organizations[ordererOrgKey];
      const ordererOrgName = ordererOrg.name;
      const odererAdminUrl = ordererUrl.hostname + ":" + (ordererPort + 2);
      const ordererPath = path.resolve("network", ordererOrgName, "Orderers", ordererName);
      const tlsRootCertPath = path.resolve("network", ordererOrgName, "msp", "tlscacerts", "tls-ca-cert.pem");
      const ordererCaCertPath = path.resolve(ordererPath, "msp", "signcerts", "cert.pem");
      const ordererCaKeyPath = path.resolve(ordererPath, "msp", "keystore", "key.pem");
  
      const args = ["channel", "join", "--channelID", "channel1", "--config-block", blockPath, "-o",
      odererAdminUrl, "--ca-file", tlsRootCertPath, "--client-cert", ordererCaCertPath, "--client-key", ordererCaKeyPath];
  
      await checkEndpoint(new URL("https://" + odererAdminUrl));
  
      osnadminRes = execSync(`${osnadminBin} ${args.join(" ")}`, {stdio : 'pipe' });
  
      // console.log("error" , osnadminRes.toString())
  
    }
    cb();
}
  
async function joinChannelPeers(cb){
  
    const peerBin = path.resolve("binaries", "peer");
  
    const networkConf = readConf("network.yaml");
  
    const peers = networkConf.peers;
    const organizations = networkConf.organizations;
    const certificateAuthorities = networkConf.certificateAuthorities;
  
    await delay(1000);
  
    for (let peerKey in peers) {
      //TODO: Refactoring needed
      const peer = peers[peerKey];
      const peerName = peer.name;
      const peerMspId = peer.mspid;
      const peerOrgKey = peer.org;
      const peerUrl = new URL(peer.url);
      const peerOrg = organizations[peerOrgKey];
      const peerOrgName = peerOrg.name;
      const peerCaKey = peerOrg.certificateAuthorities[0]; //TODO: Better CA configuration
      const peerCa = certificateAuthorities[peerCaKey];
      const peerCaUrl = new URL(peerCa.url);
      const peerPath = path.resolve("network", peerOrgName, "Peers", peerName);
  
      const CORE_PEER_TLS_ENABLED = "true";
      const CORE_PEER_LOCALMSPID = peerMspId;
      const CORE_PEER_TLS_ROOTCERT_FILE = path.resolve(peerPath, "tls/tlscacerts/tls-ca-cert.pem");
      const CORE_PEER_MSPCONFIGPATH = path.resolve(peerPath, "../../User/Admin/msp");
      const CORE_PEER_ADDRESS = peerUrl.host;
  
      // console.log(CORE_PEER_LOCALMSPID, CORE_PEER_TLS_ROOTCERT_FILE, CORE_PEER_MSPCONFIGPATH, CORE_PEER_ADDRESS);
      
      const genesisBlockPath = path.resolve("network", "artifact", "genesis_block.pb");

      const args = ["channel", "join", "-b", genesisBlockPath];
  
      env = {"CORE_PEER_TLS_ENABLED": CORE_PEER_TLS_ENABLED, "CORE_PEER_LOCALMSPID":CORE_PEER_LOCALMSPID, "CORE_PEER_TLS_ROOTCERT_FILE": CORE_PEER_TLS_ROOTCERT_FILE, 
      "CORE_PEER_MSPCONFIGPATH":CORE_PEER_MSPCONFIGPATH, "CORE_PEER_ADDRESS":CORE_PEER_ADDRESS}
  
      const peerJoin = execSync(`${peerBin} ${args.join(" ")}` , {cwd: peerPath, env, stdio : 'pipe'});
    
    }
  
    cb();
}

async function packageChainCode(cb){

    const peerBin = path.resolve("binaries", "peer");
  
    const networkConf = readConf("network.yaml");
  
    const peers = networkConf.peers;
    const organizations = networkConf.organizations;
    const certificateAuthorities = networkConf.certificateAuthorities;
    
    const peerkey = Object.keys(peers)[0]; //TODO: Refactor Env variabales into one function
    const peer = peers[peerkey];
    const peerName = peer.name;
    const peerMspId = peer.mspid;
    const peerOrgKey = peer.org;
    const peerUrl = new URL(peer.url);
    const peerOrg = organizations[peerOrgKey];
    const peerOrgName = peerOrg.name;
    const peerCaKey = peerOrg.certificateAuthorities[0]; //TODO: Better CA configuration
    const peerCa = certificateAuthorities[peerCaKey];
    const peerCaUrl = new URL(peerCa.url);
    const peerPath = path.resolve("network", peerOrgName, "Peers", peerName);
  
    const CORE_PEER_TLS_ENABLED = "true";
    const CORE_PEER_LOCALMSPID = peerMspId;
    const CORE_PEER_TLS_ROOTCERT_FILE = path.resolve(peerPath, "tls/tlscacerts/tls-ca-cert.pem");
    const CORE_PEER_MSPCONFIGPATH = path.resolve(peerPath, "../../User/Admin/msp");
    const CORE_PEER_ADDRESS = peerUrl.host;
  
    const env = {"CORE_PEER_TLS_ENABLED": CORE_PEER_TLS_ENABLED, "CORE_PEER_LOCALMSPID":CORE_PEER_LOCALMSPID, "CORE_PEER_TLS_ROOTCERT_FILE": CORE_PEER_TLS_ROOTCERT_FILE, 
      "CORE_PEER_MSPCONFIGPATH":CORE_PEER_MSPCONFIGPATH, "CORE_PEER_ADDRESS":CORE_PEER_ADDRESS}

    const args = ["lifecycle", "chaincode", "package", options["packagePath"] , "--path", options["ccPath"], "--lang", "node", "--label", options["chaincodeLabel"]];
  
    const packageChainCode = execSync(`${peerBin} ${args.join(" ")}` ,{cwd: peerPath, env:env, stdio : 'pipe' });
    cb();
}

async function deployChainCode(cb){

    const peerBin = path.resolve("binaries", "peer");
  
    const networkConf = readConf("network.yaml");
  
    const configPath = path.resolve("config");
  
    const peers = networkConf.peers;
    const orderers = networkConf.orderers;
    const organizations = networkConf.organizations;
    const certificateAuthorities = networkConf.certificateAuthorities;
  
    // const packagePath = path.resolve("network", "artifact", "basic.tar.gz");
  
    const odererKey = Object.keys(orderers)[0];
    const order = orderers[odererKey];
    const odererUrl = new URL(order.url);
    const ordererOrg = order.org;
    const ordererPath = path.resolve("network", ordererOrg, "msp", "tlscacerts", "tls-ca-cert.pem");
  
    const channelName = "mychannel";
    const channel = networkConf.channels[channelName];
  
    await delay(1000);
  
    for (let peerKey in peers) {
      //TODO: Refactoring needed
      const peer = peers[peerKey];
      const peerName = peer.name;
      const peerMspId = peer.mspid;
      const peerOrgKey = peer.org;
      const peerUrl = new URL(peer.url);
      const peerOrg = organizations[peerOrgKey];
      const peerOrgName = peerOrg.name;
      const peerCaKey = peerOrg.certificateAuthorities[0]; //TODO: Better CA configuration
      const peerCa = certificateAuthorities[peerCaKey];
      const peerCaUrl = new URL(peerCa.url);
      const peerPath = path.resolve("network", peerOrgName, "Peers", peerName);
  
      const CORE_PEER_TLS_ENABLED = "true";
      const CORE_PEER_LOCALMSPID = peerMspId;
      const CORE_PEER_TLS_ROOTCERT_FILE = path.resolve(peerPath, "tls/tlscacerts/tls-ca-cert.pem");
      const CORE_PEER_MSPCONFIGPATH = path.resolve(peerPath, "../../User/Admin/msp");
      const CORE_PEER_ADDRESS = peerUrl.host;
  
      // console.log(CORE_PEER_LOCALMSPID, CORE_PEER_TLS_ROOTCERT_FILE, CORE_PEER_MSPCONFIGPATH, CORE_PEER_ADDRESS);
  
      env = {"CORE_PEER_TLS_ENABLED": CORE_PEER_TLS_ENABLED, "CORE_PEER_LOCALMSPID":CORE_PEER_LOCALMSPID, "CORE_PEER_TLS_ROOTCERT_FILE": CORE_PEER_TLS_ROOTCERT_FILE, 
      "CORE_PEER_MSPCONFIGPATH":CORE_PEER_MSPCONFIGPATH, "CORE_PEER_ADDRESS":CORE_PEER_ADDRESS}
  
      const installArgs = ["lifecycle", "chaincode", "install", options["packagePath"]];
  
      const installChainCode = execSync(`${peerBin} ${installArgs.join(" ")}`,  {cwd: peerPath, env:env, stdio : 'pipe' });
  
      const queryInstalledArgs = ["lifecycle", "chaincode", "queryinstalled", "--output", "json"];
  
      const queryInstalled = execSync(`${peerBin} ${queryInstalledArgs.join(" ")}`,  {cwd: peerPath, env:env, stdio : 'pipe' });

      const installedPackagesInfo = JSON.parse(queryInstalled.toString());

      var CC_PACKAGE_ID = "";

      if (installedPackagesInfo){
        installed_chaincodes = installedPackagesInfo["installed_chaincodes"];

        for (const [key, value] of Object.entries(installed_chaincodes)) {
            if (value["label"] == options["chaincodeLabel"]){
                CC_PACKAGE_ID = value["package_id"];
            }
          }
      }

      //TODO: approve only for one peer in a org
      const approveformyorgArgs = ["lifecycle", "chaincode", "approveformyorg", "-o", odererUrl.host, "--channelID", "channel1", "--name" , options["chaincodeLabel"] ,"--version" , "1.0", 
      "--package-id", CC_PACKAGE_ID , "--sequence", "1" ,"--tls" , "--cafile" , ordererPath];
  
      const approveChainCode = execSync(`${peerBin} ${approveformyorgArgs.join(" ")}`,  {cwd: peerPath, env:env, stdio : 'pipe'});      
    }
  
    var peerArgs = [];
    const channelPeers = channel.peers
  
    channelPeers.forEach(channelPeer => {
      const peer = peers[channelPeer];
  
      const peerName = peer.name;
      const peerOrgKey = peer.org;
      const peerUrl = new URL(peer.url);
      const peerOrg = organizations[peerOrgKey];
      const peerOrgName = peerOrg.name;
      const peerPath = path.resolve("network", peerOrgName, "Peers", peerName);
      const peerTlsPath = path.resolve(peerPath, "tls", "tlscacerts", "tls-ca-cert.pem");
  
      peerArgs.push(["--peerAddresses", 
      peerUrl.host, "--tlsRootCertFiles", peerTlsPath
      ]);
      peerArgs = peerArgs.flat();
  
      // console.log(["--peerAddresses", 
      // peerUrl.host, "--tlsRootCertFiles", peerTlsPath
      // ]);
  
    });
      
  
    var commitArgs = ["lifecycle", "chaincode", "commit", "-o", odererUrl.host, "--channelID", "channel1", "--name" , options["chaincodeLabel"] ,"--version" 
    , "1.0", "--sequence", "1" 
    ,"--tls" , "--cafile" , ordererPath];

    commitArgs = commitArgs.concat(peerArgs);
  
    const commitChainCode = execSync(`${peerBin} ${commitArgs.join(" ")}`,  {cwd: configPath, env:env, stdio : 'pipe' });
  
    cb();
}



var pipeline = series(dockerDown, initNetworkStructure, caDockerUp, setupOrgMsp, enrollCaAdmin, 
  parallel(regsiterEnrollPeers, regsiterEnrollOrderers, 
      regsiterEnrollAdmins),networkDockerUp, generateGensisBlock, joinChannelOrderers, joinChannelPeers);

if(options.deployChaincode){
    pipeline = series(packageChainCode, deployChainCode);
}

if(options.stopNetwork){
  pipeline = parallel(dockerDown, initNetworkStructure);
}

exports.default = pipeline;
 