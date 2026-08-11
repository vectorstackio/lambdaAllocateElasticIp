// handler.ts

import {
  EC2Client,
  AllocateAddressCommand
} from '@aws-sdk/client-ec2'

import type {
  APIGatewayProxyHandler
} from 'aws-lambda'


const ec2 = new EC2Client({
  region: process.env.AWS_REGION
})


export const handler: APIGatewayProxyHandler = async () => {

  try {

    const result =
      await ec2.send(
        new AllocateAddressCommand({
          Domain: 'vpc'
        })
      )


    return {
      statusCode: 200,

      body: JSON.stringify({
        success: true,

        allocationId:
          result.AllocationId,

        publicIp:
          result.PublicIp
      })
    }


  } catch (err) {

    console.error(
      'Error in allocateElasticIpLambda:',
      err
    )


    return {
      statusCode: 500,

      body: JSON.stringify({
        error:
          'Internal server error in allocateElasticIpLambda'
      })
    }
  }
}