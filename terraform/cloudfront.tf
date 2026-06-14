# Origin Access Control for secure S3 access
    resource "aws_cloudfront_origin_access_control" "website" {
      name                              = "${var.domain_name}-oac"
      description                       = "OAC for ${var.domain_name}"
      origin_access_control_origin_type = "s3"
      signing_behavior                  = "always"
      signing_protocol                  = "sigv4"
    }

    resource "aws_cloudfront_distribution" "website" {
      enabled             = true
      is_ipv6_enabled     = true
      default_root_object = "index.html"
      aliases             = [var.domain_name]
      comment             = "Distribution for ${var.domain_name}"
      price_class         = "PriceClass_100"

      origin {
        domain_name              = aws_s3_bucket.website.bucket_regional_domain_name
        origin_id                = "s3-${aws_s3_bucket.website.id}"
        origin_access_control_id = aws_cloudfront_origin_access_control.website.id
      }

      default_cache_behavior {
        allowed_methods        = ["GET", "HEAD", "OPTIONS"]
        cached_methods         = ["GET", "HEAD"]
        target_origin_id       = "s3-${aws_s3_bucket.website.id}"
        viewer_protocol_policy = "redirect-to-https"
        compress               = true

        forwarded_values {
          query_string = false
          cookies {
            forward = "none"
          }
        }

        min_ttl     = 0
        default_ttl = 3600
        max_ttl     = 86400
      }

      custom_error_response {
        error_code            = 404
        response_code         = 404
        response_page_path    = "/error.html"
        error_caching_min_ttl = 300
      }

      restrictions {
        geo_restriction {
          restriction_type = "none"
        }
      }

      viewer_certificate {
        acm_certificate_arn      = aws_acm_certificate_validation.website.certificate_arn
        ssl_support_method       = "sni-only"
        minimum_protocol_version = "TLSv1.2_2021"
      }
    }