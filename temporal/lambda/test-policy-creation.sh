#!/bin/bash
# Test script for creating the Lambda logging IAM policy

LAMBDA_POLICY_NAME="padlox-temporal-lambda-policy-test"

# Determine the absolute path to the policy file
# This script should be run from the 'temporal/lambda' directory
BASE_DIR=$(dirname "$0") # Gets the directory where the script is located
POLICY_FILE_PATH="$BASE_DIR/lambda-policy/lambda-policy.json"

echo "Attempting to create IAM policy: $LAMBDA_POLICY_NAME"
echo "Policy file path to be used: $POLICY_FILE_PATH"

if [ ! -f "$POLICY_FILE_PATH" ]; then
    echo "ERROR: Policy file not found at $POLICY_FILE_PATH" >&2
    exit 1
fi

echo "Policy file content preview:"
cat "$POLICY_FILE_PATH"

echo ""
echo "Attempting aws iam create-policy command..."
aws iam create-policy \
  --policy-name $LAMBDA_POLICY_NAME \
  --policy-document "file://$POLICY_FILE_PATH"

if [ $? -eq 0 ]; then
    echo "Successfully created policy $LAMBDA_POLICY_NAME"
    echo "You can now delete this test policy: aws iam delete-policy --policy-arn arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/$LAMBDA_POLICY_NAME"
else
    echo "Failed to create policy $LAMBDA_POLICY_NAME"
fi 