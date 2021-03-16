import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as lambda from '@aws-cdk/aws-lambda';
import * as rds from '@aws-cdk/aws-rds'; 
import * as apigw from '@aws-cdk/aws-apigatewayv2';
import * as integrations from '@aws-cdk/aws-apigatewayv2-integrations';

export class CdkAuroraServerlessStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the VPC needed for the Aurora Serverless DB cluster
    const vpc = new ec2.Vpc(this, 'tcserverlessVPC');

    // Create the Serverless Aurora DB cluster; set the engine to Postgres
    const cluster = new rds.ServerlessCluster(this, 'AuroraTestCluster', {
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      parameterGroup: rds.ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10'),
      defaultDatabaseName: 'tcserverless',
      vpc//,
      // this line erroring on build TS2738 cdk v1.93.0
      //scaling: { autoPause: cdk.Duration.minutes(10) } // Optional. If not set, then instance will pause after 5 minutes 
    });

    // Create the Lambda function that will map GraphQL operations into Postgress
    const postFn = new lambda.Function(this, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: new lambda.AssetCode('lambda-functions'),
      handler: 'index.handler',
      memorySize: 1024,
      environment: {
        CLUSTER_ARN: cluster.clusterArn,   //managed through secrets manager so not exposed
        SECRET_ARN: cluster.secret?.secretArn || '',
        DB_NAME: 'tcserverless'
      },
    });

    // Grant access to the cluster from the Lambda function
    // only access to dataAPI.  No defining IAM policies woo!
    cluster.grantDataApiAccess(postFn);
  
     // create the API Gateway with one method and path
     let api = new apigw.HttpApi(this, 'Endpoint', {
      defaultIntegration: new integrations.LambdaProxyIntegration({
        handler: postFn
      })
    });

    new cdk.CfnOutput(this, "HTTP API URL", {
      value: api.url ?? "Something went wrong with the deploy",
    });

  }
}
