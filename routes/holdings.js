var express = require('express');
const axios = require('axios');
const convertXLSX = require('@/middleware/convertXLSX');
var Agenda = require('agenda');
var mongoose = require('mongoose');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

// connect MongoDB

const dynamoClient = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = 'StockData';

// mongoose
//   .connect('mongodb://127.0.0.1/my_database', {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
//   .then(() => console.log('MongoDB connected'))
//   .catch((err) => console.error('MongoDB connection error:', err));

const agenda = new Agenda({
  db: {
    address: 'mongodb://localhost:27017/agenda-db',
    collection: 'agendaJobs',
  },
});

agenda.on('ready', () => {
  console.log('Agenda started');
  // Schedule the job to run every day at midnight
  agenda.every('0 0 * * *', 'fetch and store stock data');
  // Start the agenda
  agenda.start();
});

agenda.on('error', (err) => {
  console.error('Agenda connection error:', err);
});

var router = express.Router();

const getVolKData = async (symbol) => {
  console.log(`Fetching ${symbol} data...`);

  try {
    const VolKData = {
      symbol,
      totalOverbuyVolK: NaN,
      totalOversellVolK: NaN,
      tradeVolumeRate: NaN,
      totalDifferenceVolK1D: NaN,
      totalDifferenceVolK5D: NaN,
      totalDifferenceVolK10D: NaN,
      totalDifferenceVolK20D: NaN,
    };
    let sumDifferenceVolK = 0;
    const { data } = await axios.get(
      `https://tw.stock.yahoo.com/_td-stock/api/resource/StockServices.brokerTrades;limit=20;sortBy=-date;symbol=${symbol}.TW`
    );
    for (let i = 0; i < data?.list.length; i++) {
      sumDifferenceVolK += data?.list[i]?.totalDifferenceVolK;
      switch (i) {
        case 4:
          VolKData.totalDifferenceVolK5D = sumDifferenceVolK;
          break;
        case 9:
          VolKData.totalDifferenceVolK10D = sumDifferenceVolK;
          break;
        case 19:
          VolKData.totalDifferenceVolK20D = sumDifferenceVolK;
          break;
      }
    }
    VolKData.totalDifferenceVolK1D = data?.list[0]?.totalDifferenceVolK;
    VolKData.totalOverbuyVolK = data?.list[0]?.totalOverbuyVolK;
    VolKData.totalOversellVolK = data?.list[0]?.totalOversellVolK;
    VolKData.tradeVolumeRate = data?.list[0]?.tradeVolumeRate;

    return new Promise((resolve) => {
      resolve(VolKData);
    });
  } catch (error) {
    console.log(error);
    return new Promise((resolve) => {
      resolve({
        symbol,
        totalOverbuyVolK: 'Error',
        totalOversellVolK: 'Error',
        tradeVolumeRate: 'Error',
        totalDifferenceVolK1D: 'Error',
        totalDifferenceVolK5D: 'Error',
        totalDifferenceVolK10D: 'Error',
        totalDifferenceVolK20D: 'Error',
      });
    });
  }
};

const getStockSymbol = async () => {
  try {
    const { data } = await axios.get(
      'https://openapi.twse.com.tw/v1/opendata/t187ap03_L'
    );
    const symbolArray = data.map((stock) => stock.公司代號);
    return symbolArray;
  } catch (error) {
    console.log(error);
  }
};

agenda.define('fetch and store stock data', async (job) => {
  console.log('Fetching and storing stock data...');

  try {
    const symbolList = await getStockSymbol();
    const volKList = [];
    for (let i = 0; i < symbolList.length; i++) {
      const VolKData = await getVolKData(symbolList[i]);
      volKList.push(VolKData);
    }

    // Save data to MongoDB
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: volKList,
    });
    await docClient.send(command);

    // await StockData.insertMany(volKList);
  } catch (error) {
    console.log(error);
  }
});

router.get('/holdings', async (req, res, next) => {
  try {
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 10).replace(/-/g, '-');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${
        formattedDate + encodeURIComponent('主力資料')
      }.xlsx`
    );

    // Fetch data from MongoDB

    const command = new ScanCommand({ TableName: TABLE_NAME });
    const stockData = await docClient.send(command);

    // const stockData = await StockData.find(
    //   {},
    //   {
    //     symbol: 1,
    //     totalOverbuyVolK: 1,
    //     totalOversellVolK: 1,
    //     tradeVolumeRate: 1,
    //     totalDifferenceVolK1D: 1,
    //     totalDifferenceVolK5D: 1,
    //     totalDifferenceVolK10D: 1,
    //     totalDifferenceVolK20D: 1,
    //     _id: 0,
    //   }
    // );

    // because stockData is a Mongoose document, we need to convert it to a plain object
    const temp = stockData.map((stock) => stock.toObject());

    // Convert data to XLSX
    res.send(convertXLSX(temp));
  } catch (error) {
    console.log(error);
  }
});

module.exports = router;
