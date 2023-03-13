# Fabric Network Manager

## Setup

```sh
npm install --global gulp-cli
npm install
npm run prepare
npm start
```

## Usage

Start the network:

```sh
POST: localhost:3000/startNetwork
```

Stop the network: 

```sh
GET: localhost:3000/stopNetwork
```
Deploy chaincodes:

```sh
POST: localhost:3000/deployCC
```

Retreive connection file:

```sh
GET: localhost:3000/connectionFile
```

## TODOs

- Refactor Gulp file
- Add more functionalities: Add/Remove Org, Modify Chaincode, etc

