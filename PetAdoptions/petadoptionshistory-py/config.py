import os
import json
import boto3

def fetch_config():
    cfg = {
        'update_adoption_url': os.getenv("UPDATE_ADOPTION_URL"),
        'rds_secret_arn': os.getenv("RDS_SECRET_ARN"),
        'region': os.getenv("AWS_REGION")
    }

    if cfg['update_adoption_url'] == None or cfg['rds_secret_arn'] == None:
        return fetch_config_from_parameter_store(cfg['region'])

    return cfg

def fetch_config_from_parameter_store(region):
    client = boto3.client('ssm', region_name=region)

    result = client.get_parameters(
        Names=[
            '/banilux/updateadoptionstatusurl',
            '/banilux/rdssecretarn',
            '/banilux/s3bucketname',
            '/banilux/dynamodbtablename'
        ]
    )

    cfg = {
        'region': region
    }

    for p in result['Parameters']:
        if p['Name'] == '/banilux/updateadoptionstatusurl':
            cfg['update_adoption_url'] = p['Value']
        elif p['Name'] == '/banilux/rdssecretarn':
            cfg['rds_secret_arn'] = p['Value']
        elif p['Name'] == '/banilux/s3bucketname':
            cfg['s3_bucket_name'] = p['Value']
        elif p['Name'] == '/banilux/dynamodbtablename':
            cfg['dynamodb_tablename'] = p['Value']

    return cfg

def get_secret_value(secret_id, region):
    client = boto3.client('secretsmanager', region_name=region)

    response = client.get_secret_value(
        SecretId=secret_id
    )

    return response['SecretString']

def get_rds_connection_parameters(secret_id, region):
    jsonstr = get_secret_value(secret_id, region)

    c = json.loads(jsonstr)

    u = {
        'database': c['dbname'],
        'user':     c['username'],
        'password': c['password'],
        'host':     c['host']
    }

    return u