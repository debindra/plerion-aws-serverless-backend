const AWS = require("aws-sdk");

//PACKAGES ARE NOT WORKING
// const sharp = require('sharp'); // For image processing
// const axios = require('axios');

const eventBridge = new AWS.EventBridge();

const s3 = new AWS.S3();
const bucketName = process.env.BUCKET_NAME;

const dynamoDB = new AWS.DynamoDB.DocumentClient(
  { region: "us-east-1" },
  {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  }
);

// Get the DynamoDB table name from environment variables
const tableName = process.env.DYNAMODB_TABLE;

// Add Product name
exports.addProduct = async (event) => {
  try {
    const { productName, price, description, imageUrl } = JSON.parse(
      event.body
    );

    const newProduct = {
      id: event.requestContext.requestId,
      productName,
      price,
      description,
      imageUrl,
    };

    const params = {
      TableName: tableName,
      Item: newProduct,
    };

    await dynamoDB.put(params).promise();

    // Emit an event to EventBridge
    /* const eventDetail = {
        product_id: newProduct.id, // Include relevant details for the thumbnail generation
        image_url: newProduct.imageUrl
      };
  
    await eventBridge.putEvents({
        Entries: [
          {
            Source: 'custom.product',
            DetailType: 'ProductCreated',
            Detail: JSON.stringify(eventDetail),
            EventBusName: process.env.EVENT_BUS_NAME
          },
        ],
      }).promise();

      Save image to S3 bucket

    const response = await axios.get(newProduct.imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');
        
        const thumbnailBuffer = await sharp(imageBuffer)
            .resize(100, 100) // Adjust the size as needed
            .toBuffer();
        
        const thumbnailKey = `thumbnails/${product_id}.jpg`;
        
        await s3.putObject({
            Bucket: bucketName,
            Key: thumbnailKey,
            Body: thumbnailBuffer,
            ContentType: 'image/jpeg',
        }).promise();
    
        const thumbnailUrl = `https://${bucketName}.s3.amazonaws.com/${thumbnailKey}`;
        
      */

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Product added successfully",
        product: newProduct,
        thumbnailUrl,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error }),
    };
  }
};

// Get prduct list
exports.getProducts = async (event) => {
  try {
    const params = {
      TableName: tableName,
    };

    const result = await dynamoDB.scan(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ products: result.Items }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error fetching products" }),
    };
  }
};

//Delete individual product
exports.deleteProduct = async (event) => {
  try {
    const { id } = event.pathParameters; // Get the path parameter(product id)

    const params = {
      TableName: tableName,
      Key: {
        id,
      },
    };

    await dynamoDB.delete(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Product deleted successfully" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error deleting product" }),
    };
    // Handle errors and respond with an error message or appropriate status code
  }
};

//Generate the thumbnail image of product from the image url
exports.generateProductThumbnail = async (event) => {
  try {
    const { image_url, product_id } = JSON.parse(event.detail); // Assuming product_id and image_url are in the event detail

    const response = await axios.get(image_url, {
      responseType: "arraybuffer",
    });
    const imageBuffer = Buffer.from(response.data, "binary");

    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(100, 100) // Adjust the size as needed
      .toBuffer();

    const thumbnailKey = `thumbnails/${product_id}.jpg`;

    await s3
      .putObject({
        Bucket: bucketName,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: "image/jpeg",
      })
      .promise();

    const thumbnailUrl = `https://${bucketName}.s3.amazonaws.com/${thumbnailKey}`;

    // Update the table for product thumbnail image
    const updateParams = {
      TableName: tableName,
      Key: { id: { S: product_id } }, //  'id' is the primary key
      UpdateExpression: "SET thumbnailUrl = :thumbnailUrl", // Update the ThumbnailUrl attribute
      ExpressionAttributeValues: { ":thumbnailUrl": { S: thumbnailUrl } }, // Attribute values
    };
    // Perform the update
    await dynamodb.updateItem(updateParams).promise();

    return "Thumbnail generated and stored successfully.";
  } catch (error) {
    console.error("Error:", error);
    throw new Error("Thumbnail generation and storage failed.");
  }
};
