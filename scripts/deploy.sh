#!/bin/bash
set -euo pipefail

DOMAIN_TO_CREATE="math.simiacrypt.us"
SERVE_FROM="simiacryptus.github.io/Fun_With_Math/"

# Configure a new domain for my existing TLD to link to my existing GitHub Pages site.
# This is a one-time setup, using the default AWS profile.
# It will create a new hosted zone, and add a CNAME record to point to the GitHub Pages site.

# Requirements:
#   - awscli v2 configured with a default profile that has Route53 permissions
#   - jq installed
#   - The parent domain (e.g. simiacrypt.us) is registered (NS delegation step is manual if registrar is not Route53)

command -v aws >/dev/null 2>&1 || { echo "aws CLI is required but not installed. Aborting." >&2; exit 1; }
command -v jq  >/dev/null 2>&1 || { echo "jq is required but not installed. Aborting." >&2; exit 1; }

# Derive the parent (apex) domain. For "math.simiacrypt.us" -> "simiacrypt.us"
PARENT_DOMAIN="$(echo "$DOMAIN_TO_CREATE" | awk -F. '{n=NF; print $(n-1)"."$n}')"

# Strip any trailing slash from the GitHub Pages target so it's a valid CNAME value
CNAME_TARGET="${SERVE_FROM%/}"
# Also strip any path component — CNAMEs cannot contain paths
CNAME_TARGET="${CNAME_TARGET%%/*}"

echo "Domain to create:   $DOMAIN_TO_CREATE"
echo "Parent domain:      $PARENT_DOMAIN"
echo "CNAME target:       $CNAME_TARGET"
echo

# ---------------------------------------------------------------------------
# 1. Find or create a hosted zone for the parent domain
# ---------------------------------------------------------------------------
echo "Looking up hosted zone for $PARENT_DOMAIN ..."
HOSTED_ZONE_ID="$(aws route53 list-hosted-zones-by-name \
    --dns-name "$PARENT_DOMAIN." \
    --max-items 1 \
    --query "HostedZones[?Name=='${PARENT_DOMAIN}.'].Id | [0]" \
    --output text)"

if [[ -z "$HOSTED_ZONE_ID" || "$HOSTED_ZONE_ID" == "None" ]]; then
    echo "No hosted zone found for $PARENT_DOMAIN. Creating one ..."
    CALLER_REF="deploy-$(date +%s)"
    CREATE_OUT="$(aws route53 create-hosted-zone \
        --name "$PARENT_DOMAIN" \
        --caller-reference "$CALLER_REF")"
    HOSTED_ZONE_ID="$(echo "$CREATE_OUT" | jq -r '.HostedZone.Id')"
    echo "Created hosted zone: $HOSTED_ZONE_ID"
    echo
    echo "IMPORTANT: Update your registrar's NS records for $PARENT_DOMAIN to:"
    echo "$CREATE_OUT" | jq -r '.DelegationSet.NameServers[]' | sed 's/^/  - /'
    echo
else
    # Strip the "/hostedzone/" prefix that AWS returns
    HOSTED_ZONE_ID="${HOSTED_ZONE_ID#/hostedzone/}"
    echo "Using existing hosted zone: $HOSTED_ZONE_ID"
fi

# ---------------------------------------------------------------------------
# 2. Upsert the CNAME record for the subdomain
# ---------------------------------------------------------------------------
CHANGE_BATCH="$(cat <<EOF
{
  "Comment": "Point $DOMAIN_TO_CREATE at GitHub Pages site $CNAME_TARGET",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "$DOMAIN_TO_CREATE",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [
          { "Value": "$CNAME_TARGET" }
        ]
      }
    }
  ]
}
EOF
)"

echo "Upserting CNAME: $DOMAIN_TO_CREATE -> $CNAME_TARGET"
CHANGE_ID="$(aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch "$CHANGE_BATCH" \
    --query 'ChangeInfo.Id' \
    --output text)"

echo "Submitted change: $CHANGE_ID"
echo "Waiting for change to propagate within Route53 ..."
aws route53 wait resource-record-sets-changed --id "$CHANGE_ID"
echo "DNS change is INSYNC."

# ---------------------------------------------------------------------------
# 3. Reminders for the GitHub side
# ---------------------------------------------------------------------------
cat <<EOF

Done. Next steps on GitHub:
  1. In the repo serving the site (Fun_With_Math), add a file named CNAME
     at the repository root (or in the gh-pages branch root) containing:

         $DOMAIN_TO_CREATE

  2. In Settings -> Pages, set the custom domain to:

         $DOMAIN_TO_CREATE

     and enable "Enforce HTTPS" once the certificate has been issued.

  3. Verify with:
         dig +short $DOMAIN_TO_CREATE
         curl -I https://$DOMAIN_TO_CREATE
EOF